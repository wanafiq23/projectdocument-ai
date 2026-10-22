from io import BytesIO
from uuid import UUID

from docx import Document as WordDocument
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.models import Document

ACCOUNT = {'name': 'Alex Morgan', 'email': 'alex@example.com', 'password': 'Valid-password-123'}
PROJECT = {'name': 'Website Redesign', 'description': 'Build a clear website.', 'category': 'Design', 'color': 'blue', 'status': 'Planning', 'dueDate': '2027-01-30'}
TASK = {'title': 'Review navigation', 'description': 'Check mobile too.', 'priority': 'High', 'status': 'To Do', 'dueDate': '2027-01-20', 'assignee': 'Alex Morgan'}


def project_for(client):
    assert client.post('/api/auth/register', json=ACCOUNT).status_code == 201
    result = client.post('/api/projects', json=PROJECT)
    assert result.status_code == 201, result.text
    return result.json()['id']


def upload(client, project_id, name, payload, content_type='application/octet-stream'):
    return client.post(f'/api/documents/projects/{project_id}', files={'file': (name, payload, content_type)})


def test_tasks_are_persistent_project_scoped_and_validated(client, app):
    assert client.get('/api/tasks').status_code == 401
    project_id = project_for(client)
    task_input = {**TASK, 'projectId': project_id}
    created = client.post('/api/tasks', json=task_input)
    assert created.status_code == 201, created.text
    task = created.json()
    assert task['title'] == TASK['title']
    assert client.get('/api/tasks').json() == [task]
    assert client.post('/api/tasks', json={**task_input, 'status': 'Blocked'}).status_code == 422
    assert client.post('/api/tasks', json={**task_input, 'assignee': 'Not a member'}).status_code == 422
    updated = client.put(f"/api/tasks/{task['id']}", json={**task_input, 'status': 'Done'})
    assert updated.status_code == 200 and updated.json()['status'] == 'Done'

    with TestClient(app, base_url='http://localhost', headers={'X-ProjectDocumentAI-Request': '1'}) as other:
        assert other.post('/api/auth/register', json={**ACCOUNT, 'name': 'Other Person', 'email': 'other@example.com'}).status_code == 201
        assert other.get('/api/tasks').json() == []
        assert other.post('/api/tasks', json=task_input).status_code == 404
        assert other.put(f"/api/tasks/{task['id']}", json=task_input).status_code == 404
        assert other.delete(f"/api/tasks/{task['id']}").status_code == 404

    assert client.get('/api/tasks').json()[0]['status'] == 'Done'
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get('/api/tasks').json() == []
    assert client.post('/api/tasks', json=task_input).status_code == 201
    assert client.delete(f'/api/projects/{project_id}').status_code == 204
    assert client.get('/api/tasks').json() == []


def test_documents_survive_requests_extract_text_and_enforce_access(client, app):
    assert client.get('/api/documents').status_code == 401
    project_id = project_for(client)
    created = upload(client, project_id, 'Notes.txt', b'Project launch notes\nNext step: review tasks.', 'text/plain')
    assert created.status_code == 201, created.text
    document = created.json()
    assert document['processingStatus'] == 'ready'
    assert 'Next step: review tasks.' in document['content']
    assert client.get('/api/documents').json() == [document]
    file_url = f"/api/documents/{document['id']}/file"
    assert client.get(file_url).content == b'Project launch notes\nNext step: review tasks.'

    with TestClient(app, base_url='http://localhost', headers={'X-ProjectDocumentAI-Request': '1'}) as other:
        assert other.post('/api/auth/register', json={**ACCOUNT, 'name': 'Other Person', 'email': 'other@example.com'}).status_code == 201
        assert other.get('/api/documents').json() == []
        assert other.get(file_url).status_code == 404
        assert other.delete(f"/api/documents/{document['id']}").status_code == 404
        assert upload(other, project_id, 'Other.txt', b'No access').status_code == 404

    with app.state.session_factory() as db:
        stored = db.get(Document, UUID(document['id']))
        path = app.state.settings.upload_dir / stored.storage_key
    assert path.exists()
    assert client.delete(f"/api/documents/{document['id']}").status_code == 204
    assert not path.exists()
    assert client.get('/api/documents').json() == []


def test_docx_pdf_status_and_upload_limits(client, app):
    project_id = project_for(client)
    word = WordDocument()
    word.add_paragraph('A persistent document summary.')
    word_bytes = BytesIO()
    word.save(word_bytes)
    docx = upload(client, project_id, 'Summary.docx', word_bytes.getvalue())
    assert docx.status_code == 201, docx.text
    assert docx.json()['processingStatus'] == 'ready'
    assert 'persistent document summary' in docx.json()['content']

    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    pdf_bytes = BytesIO()
    writer.write(pdf_bytes)
    pdf = upload(client, project_id, 'Blank.pdf', pdf_bytes.getvalue(), 'application/pdf')
    assert pdf.status_code == 201, pdf.text
    assert pdf.json()['processingStatus'] == 'empty'
    failed = upload(client, project_id, 'Broken.pdf', b'not a PDF')
    assert failed.status_code == 201 and failed.json()['processingStatus'] == 'failed'
    assert client.get(f"/api/documents/{failed.json()['id']}/file").content == b'not a PDF'
    assert upload(client, project_id, 'bad.exe', b'test').status_code == 415
    assert upload(client, project_id, 'empty.txt', b'').status_code == 413
    assert upload(client, project_id, 'large.txt', b'x' * (50 * 1024 * 1024 + 1)).status_code == 413

    with app.state.session_factory() as db:
        paths = [app.state.settings.upload_dir / item.storage_key for item in db.query(Document).all()]
    assert all(path.exists() for path in paths)
    assert client.delete(f'/api/projects/{project_id}').status_code == 204
    assert all(not path.exists() for path in paths)
