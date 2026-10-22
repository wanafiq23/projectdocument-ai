"""Exercise the real LangChain Google adapter with SDK responses mocked offline."""
import json
from unittest.mock import MagicMock

import pytest
from google.genai import types
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool

from app.ai import AIService
from app.ai.schemas import GroundedAnswer, TaskQuery
from app.config import Settings


@pytest.fixture
def service():
    return AIService(Settings(_env_file=None, gemini_api_key='offline-test-key',
                              mongodb_uri='mongodb://offline-test-only'))


def response(*parts):
    return types.GenerateContentResponse(candidates=[
        types.Candidate(content=types.Content(role='model', parts=list(parts)),
                        finish_reason='STOP')])


def test_embeddings_use_retrieval_tasks_dimensions_and_unit_length(service, monkeypatch):
    embeddings = service.embeddings
    vector = [3.0, 4.0] + [0.0] * 1534
    sdk = MagicMock(return_value=types.EmbedContentResponse(
        embeddings=[types.ContentEmbedding(values=vector)]))
    monkeypatch.setattr(embeddings.client.models, 'embed_content', sdk)
    documents = embeddings.embed_documents(['Launch is October 12.'])
    query = embeddings.embed_query('When is launch?')
    assert documents == [pytest.approx([0.6, 0.8] + [0.0] * 1534)]
    assert query == pytest.approx(documents[0])
    assert [call.kwargs['config'].task_type for call in sdk.call_args_list] == [
        'RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY']
    assert all(call.kwargs['config'].output_dimensionality == 1536 for call in sdk.call_args_list)
    assert embeddings.vertexai is False


@pytest.mark.parametrize('vector', [[1.0], [0.0] * 1536, [float('nan')] * 1536])
def test_invalid_embeddings_are_rejected(service, monkeypatch, vector):
    sdk = MagicMock(return_value=types.EmbedContentResponse(
        embeddings=[types.ContentEmbedding(values=vector)]))
    monkeypatch.setattr(service.embeddings.client.models, 'embed_content', sdk)
    with pytest.raises(ValueError):
        service.embeddings.embed_query('Question')


@pytest.mark.parametrize('schema,payload', [
    (GroundedAnswer, {'answer': 'Launch is October 12 [S1].', 'source_ids': ['S1']}),
    (TaskQuery, {'status': 'To Do', 'priority': 'High', 'overdue': True, 'limit': 5}),
])
def test_native_structured_output_parses_citations_and_task_filters(service, monkeypatch, schema, payload):
    sdk = MagicMock(return_value=response(types.Part(text=json.dumps(payload))))
    monkeypatch.setattr(service.llm.client.models, 'generate_content', sdk)
    parsed = service.llm.with_structured_output(schema).invoke('Use the supplied evidence.')
    assert parsed == schema(**payload)
    assert service.llm.vertexai is False
    assert sdk.call_args.kwargs['config'].response_mime_type == 'application/json'


def test_tool_call_and_tool_result_round_trip(service, monkeypatch):
    @tool
    def project_overview() -> str:
        """Read the current project's progress."""
        return '2 of 3 tasks done'

    sdk = MagicMock(side_effect=[
        response(types.Part(function_call=types.FunctionCall(name='project_overview', args={}))),
        response(types.Part(text='Two of three tasks are complete.')),
    ])
    monkeypatch.setattr(service.llm.client.models, 'generate_content', sdk)
    bound = service.llm.bind_tools([project_overview])
    messages = [HumanMessage(content='Show project progress')]
    answer = bound.invoke(messages)
    assert answer.tool_calls[0]['name'] == 'project_overview'
    final = bound.invoke([*messages, answer, ToolMessage(
        content=project_overview.invoke({}), tool_call_id=answer.tool_calls[0]['id'])])
    assert 'Two of three' in final.content
    parts = [part for content in sdk.call_args.kwargs['contents'] for part in content.parts]
    assert any(part.function_response and part.function_response.name == 'project_overview' for part in parts)
