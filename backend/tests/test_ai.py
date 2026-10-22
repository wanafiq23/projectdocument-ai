"""Provider boundaries are mocked; authorization and query tests use isolated PostgreSQL."""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from langchain_core.documents import Document as LCDocument
from langchain_core.messages import AIMessage
from pydantic import SecretStr
from sqlalchemy import select

from app.ai.extraction import extract_pages, split_pages
from app.ai.schemas import GroundedAnswer, TaskQuery
from app.models import Document, Project, Task
from tests.test_api import ACCOUNT, PROJECT, register


def project(client):
    register(client)
    return client.post('/api/projects', json=PROJECT).json()


def upload(client, pid):
    response = client.post(f'/api/documents/projects/{pid}', files={'file': ('Brief.txt', b'The launch is October 12. The owner is Alex.', 'text/plain')})
    assert response.status_code == 201, response.text
    return response.json()


def configured_ai(app, monkeypatch):
    ai = app.state.ai
    monkeypatch.setattr(ai.settings, 'gemini_api_key', SecretStr('test-only'))
    monkeypatch.setattr(ai.settings, 'mongodb_uri', SecretStr('mongodb://test-only'))
    mongo = MagicMock()
    ai.__dict__['mongo'] = mongo
    return ai, mongo.__getitem__.return_value


def test_missing_configuration_is_explicit_and_history_empty(client):
    p = project(client)
    doc = upload(client, p['id'])
    assert doc['indexingStatus'] == 'not_configured'
    assert client.get('/api/ai/status').json()['configured'] is False
    assert client.get(f"/api/ai/projects/{p['id']}/messages").json() == []
    response = client.post(f"/api/ai/projects/{p['id']}/messages",
        json={'message': 'When is launch?', 'requestId': str(uuid4())})
    assert response.status_code == 503
    assert 'setup' in response.json()['detail'].lower()
    assert client.post(f"/api/documents/{doc['id']}/index").status_code == 503


def test_ai_history_index_and_summary_cannot_access_other_accounts(client, app, monkeypatch):
    p = project(client)
    doc = upload(client, p['id'])
    ai = app.state.ai
    spy = MagicMock()
    monkeypatch.setattr(ai, 'answer', spy)
    with TestClient(app, base_url='http://localhost', headers={'X-ProjectDocumentAI-Request': '1'}) as other:
        register(other, email='other@example.com')
        url = f"/api/ai/projects/{p['id']}/messages"
        assert other.get(url).status_code == 404
        assert other.delete(url).status_code == 404
        assert other.post(url, json={'message': 'read secrets', 'requestId': str(uuid4()),
                                    'mode': 'summary', 'documentId': doc['id']}).status_code == 404
        assert other.post(f"/api/documents/{doc['id']}/index").status_code == 404
    spy.assert_not_called()


def test_task_query_is_scoped_parameterized_and_counts_before_limit(client, app):
    p = project(client)
    with app.state.session_factory() as db:
        other = Project(name='Other', description='', category='Other', color='blue', status='Planning', due_date=date.today())
        db.add(other); db.flush()
        for pid, title in ((UUID(p['id']), 'My overdue task'), (other.id, 'Secret overdue task')):
            db.add(Task(project_id=pid, title=title, description='', priority='High', status='To Do',
                        due_date=date.today()-timedelta(days=1), assignee='Alex Morgan'))
        db.commit()
        result = app.state.ai.query_tasks(db, UUID(p['id']), TaskQuery(overdue=True, limit=1))
        assert result['matched_count'] == 1
        assert [row['title'] for row in result['tasks']] == ['My overdue task']
        result = app.state.ai.query_tasks(db, UUID(p['id']), TaskQuery(title_contains="%' OR 1=1 --"))
        assert result['matched_count'] == 0


def test_retrieval_filters_project_and_rejects_stale_or_deleted_sources(client, app):
    p = project(client); doc = upload(client, p['id'])
    store = MagicMock()
    app.state.ai.__dict__['vector_store'] = store
    with app.state.session_factory() as db:
        record = db.get(Document, UUID(doc['id']))
        record.index_generation = 'current'; db.commit()
        store.similarity_search.return_value = [
            LCDocument(page_content='stale text', metadata={'document_id': doc['id'], 'generation': 'old'}),
            LCDocument(page_content='deleted text', metadata={'document_id': str(uuid4()), 'generation': 'current'}),
            LCDocument(page_content='launch text', metadata={'document_id': doc['id'], 'generation': 'current', 'page': 2, 'chunk': 3})]
        sources = app.state.ai.retrieve(db, UUID(p['id']), 'launch')
    assert len(sources) == 1 and sources[0]['text'] == 'launch text'
    assert sources[0]['page'] == 2
    assert store.similarity_search.call_args.kwargs['pre_filter']['project_id'] == {'$eq': p['id']}


def test_citations_come_from_evidence_and_invalid_ids_are_rejected(app):
    ai = app.state.ai
    llm = MagicMock()
    ai.__dict__['llm'] = llm
    source = {
        'documentId': str(uuid4()),
        'name': 'Brief.pdf',
        'page': 4,
        'chunk': 7,
        'text': 'Launch October 12. ' + ('Supporting detail. ' * 40),
    }
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(answer='Launch October 12 [S1].', source_ids=['S1'])
    answer, citations = ai.grounded('When?', [source])
    assert 'October 12' in answer
    assert citations[0]['name'] == 'Brief.pdf' and citations[0]['location'] == 'Page 4, chunk 7'
    assert citations[0]['excerpt'] == source['text']
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(answer='Invented [S9]', source_ids=['S9'])
    answer, citations = ai.grounded('When?', [source])
    assert citations == [] and 'unsupported' in answer
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(answer='No evidence', source_ids=[])
    assert ai.grounded('When?', [source])[1] == []


def test_rag_chat_persists_pair_and_request_replay_is_idempotent(client, app, monkeypatch):
    p = project(client); doc = upload(client, p['id'])
    ai, mongo = configured_ai(app, monkeypatch)
    turns = mongo.chat_turns
    turns.find_one.return_value = None
    turns.find.return_value.sort.return_value.limit.return_value = []
    monkeypatch.setattr(ai, 'retrieve', lambda *args: [
        {'documentId': doc['id'], 'name': doc['name'], 'page': None, 'chunk': 1, 'text': 'Launch October 12.'}])
    llm = MagicMock(); ai.__dict__['llm'] = llm
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(answer='October 12 [S1]', source_ids=['S1'])
    payload = {'message': 'When?', 'requestId': str(uuid4())}
    url = f"/api/ai/projects/{p['id']}/messages"
    response = client.post(url, json=payload)
    assert response.status_code == 200, response.text
    pair = response.json()
    assert [m['role'] for m in pair] == ['user', 'assistant']
    assert pair[1]['citations'][0]['documentId'] == doc['id']
    saved = turns.update_one.call_args.args[1]['$set']
    assert saved['status'] == 'complete' and saved['messages'] == pair
    inserted = turns.insert_one.call_args.args[0]
    assert inserted['project_id'] == p['id'] and inserted['user_id']
    turns.find_one.return_value = {**inserted, **saved}
    replay = client.post(url, json=payload)
    assert replay.json() == pair
    assert llm.with_structured_output.return_value.invoke.call_count == 1
    assert client.post(url, json={**payload, 'message': 'Different'}).status_code == 409


def test_provider_errors_are_sanitized(client, app, monkeypatch):
    p = project(client)
    def fail(*args): raise RuntimeError('secret-token-do-not-leak')
    monkeypatch.setattr(app.state.ai, 'answer', fail)
    result = client.post(f"/api/ai/projects/{p['id']}/messages", json={'message': 'Test', 'requestId': str(uuid4())})
    assert result.status_code == 503 and 'secret-token' not in result.text


def test_summary_checks_document_project_and_preserves_chunk_sources(client, app):
    p = project(client); doc = upload(client, p['id'])
    ai = app.state.ai
    llm = MagicMock(); ai.__dict__['llm'] = llm
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(answer='Launch October 12 [S1]', source_ids=['S1'])
    with app.state.session_factory() as db:
        answer, sources = ai.summary(db, UUID(p['id']), UUID(doc['id']))
        assert 'October 12' in answer and sources[0]['location'] == 'Chunk 1'
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as err:
            ai.summary(db, uuid4(), UUID(doc['id']))
        assert err.value.status_code == 404


def test_agent_executes_project_tools_and_reports_trace(client, app):
    p = project(client)
    ai = app.state.ai
    llm = MagicMock(); ai.__dict__['llm'] = llm
    llm.bind_tools.return_value.invoke.side_effect = [
        AIMessage(content='', tool_calls=[{'id': 'call-1', 'name': 'project_overview', 'args': {}}]),
        AIMessage(content='Ready')]
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(answer='The project is Planning.', source_ids=[])
    with app.state.session_factory() as db:
        record = db.get(Project, UUID(p['id']))
        answer, sources, trace = ai.agent(db, record, 'Project status?', [])
    assert 'Planning' in answer and sources == []
    assert trace == ['project_overview']


def test_agent_graph_stops_after_four_tool_rounds(client, app):
    p = project(client)
    ai = app.state.ai
    llm = MagicMock(); ai.__dict__['llm'] = llm
    llm.bind_tools.return_value.invoke.side_effect = [
        AIMessage(content='', tool_calls=[{
            'id': f'call-{index}', 'name': 'project_overview', 'args': {},
        }])
        for index in range(4)
    ]
    llm.with_structured_output.return_value.invoke.return_value = GroundedAnswer(
        answer='The project is Planning.', source_ids=[])
    with app.state.session_factory() as db:
        record = db.get(Project, UUID(p['id']))
        answer, sources, trace = ai.agent(db, record, 'Check repeatedly.', [])
    assert 'Planning' in answer and sources == []
    assert trace == ['project_overview'] * 4
    assert llm.bind_tools.return_value.invoke.call_count == 4


def test_agent_graph_rejects_more_than_four_tools_in_one_round(client, app):
    from fastapi import HTTPException

    p = project(client)
    ai = app.state.ai
    llm = MagicMock(); ai.__dict__['llm'] = llm
    llm.bind_tools.return_value.invoke.return_value = AIMessage(content='', tool_calls=[{
        'id': f'call-{index}', 'name': 'project_overview', 'args': {},
    } for index in range(5)])
    with app.state.session_factory() as db:
        record = db.get(Project, UUID(p['id']))
        with pytest.raises(HTTPException) as error:
            ai.agent(db, record, 'Use too many tools.', [])
    assert error.value.status_code == 422


def test_page_chunk_metadata_is_not_fabricated():
    pages = [{'page': 1, 'text': 'First page. ' * 200}, {'page': 2, 'text': 'Second page.'}]
    chunks = split_pages(pages)
    assert {c['page'] for c in chunks} == {1, 2}
    assert [c['chunk'] for c in chunks] == list(range(1, len(chunks) + 1))
    txt = split_pages(extract_pages('TXT', b'A text file.'))
    assert txt[0]['page'] is None and txt[0]['chunk'] == 1


def test_profile_password_changes_preserve_current_session_and_revoke_others(client, app):
    p = project(client)
    with TestClient(app, base_url='http://localhost', headers={'X-ProjectDocumentAI-Request': '1'}) as other:
        other.post('/api/auth/login', json={'email': ACCOUNT['email'], 'password': ACCOUNT['password']})
        assert client.put('/api/auth/me', json={'name': 'New Name'}).json()['name'] == 'New Name'
        assert client.put('/api/auth/me', json={'name': '  '}).status_code == 422
        assert client.put('/api/auth/password', json={'currentPassword': 'incorrect-password', 'newPassword': 'Changed-password-123'}).status_code == 400
        changed = client.put('/api/auth/password', json={'currentPassword': ACCOUNT['password'], 'newPassword': 'Changed-password-123'})
        assert changed.status_code == 204
        assert client.get('/api/auth/me').status_code == 200
        assert other.get('/api/auth/me').status_code == 401
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'email': ACCOUNT['email'], 'password': 'Changed-password-123'}).status_code == 200


def test_indexing_writes_page_metadata_and_failure_is_retryable(client, app, monkeypatch):
    p = project(client); doc = upload(client, p['id'])
    ai, mongo = configured_ai(app, monkeypatch)
    store = MagicMock(); ai.__dict__['vector_store'] = store
    with app.state.session_factory() as db:
        record = db.get(Document, UUID(doc['id']))
        ai.index_document(record, db)
        assert record.indexing_status == 'indexed' and record.index_generation
        records = store.add_documents.call_args.args[0]
        assert records[0].metadata['project_id'] == p['id']
        assert records[0].metadata['chunk'] == 1 and records[0].metadata['page'] is None
        assert records[0].metadata['generation'] == record.index_generation
        content = mongo.document_content.update_one.call_args.args[1]['$set']
        assert content['pages'][0]['text'].startswith('The launch')
        generation = record.index_generation
        store.add_documents.side_effect = RuntimeError('private provider error')
        ai.index_document(record, db)
        assert record.indexing_status == 'failed' and 'private provider error' not in record.indexing_error
        assert record.index_generation == generation
        store.add_documents.side_effect = None
        ai.index_document(record, db)
        assert record.indexing_status == 'indexed' and record.index_generation != generation
