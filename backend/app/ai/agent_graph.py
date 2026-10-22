"""Bounded LangGraph orchestration for the read-only project agent."""

import json
from typing import Annotated, Any, TypedDict
from uuid import UUID

from fastapi import HTTPException
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from .schemas import TaskQuery

MAX_AGENT_ROUNDS = 4
MAX_TOOL_CALLS_PER_ROUND = 4


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    sources: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    tools_used: list[str]
    rounds: int
    answer: str
    citations: list[dict[str, Any]]


def run_agent_graph(service, db, project, question: str, history: list[dict], system_prompt: str):
    """Run a project-scoped agent graph and return its grounded response."""

    @tool
    def search_documents(query: str) -> str:
        """Find evidence in the selected project's uploaded documents."""
        return json.dumps(service.retrieve(db, project.id, query[:4000]))

    @tool
    def find_tasks(status: str = '', priority: str = '', overdue: bool = False) -> str:
        """Read current project tasks. Status: To Do, In Progress, Done. Priority: Low, Medium, High."""
        result = service.query_tasks(
            db,
            project.id,
            TaskQuery(status=status or None, priority=priority or None, overdue=overdue),
        )
        return json.dumps(result)

    @tool
    def project_overview() -> str:
        """Read this project's details, task counts, and document identifiers."""
        return json.dumps(service.statistics(db, project))

    @tool
    def summarize_document(document_id: str) -> str:
        """Summarize a project document using an ID returned by project_overview."""
        summary, citations = service.summary(db, project.id, UUID(document_id))
        sources = [{
            'documentId': citation['documentId'],
            'name': citation['name'],
            'text': citation['excerpt'],
            'page': citation.get('page'),
            'chunk': citation.get('chunk'),
        } for citation in citations]
        return json.dumps({'summary': summary, 'sources': sources})

    tools = (search_documents, find_tasks, project_overview, summarize_document)
    available = {item.name: item for item in tools}
    model = service.llm.bind_tools(list(tools))

    def call_model(state: AgentState):
        return {
            'messages': [model.invoke(state['messages'])],
            'rounds': state['rounds'] + 1,
        }

    def route_model(state: AgentState) -> str:
        response = state['messages'][-1]
        return 'execute_tools' if getattr(response, 'tool_calls', None) else 'finalize'

    def execute_tools(state: AgentState):
        response = state['messages'][-1]
        calls = response.tool_calls
        if len(calls) > MAX_TOOL_CALLS_PER_ROUND:
            raise HTTPException(422, 'The assistant requested too many tools. Please ask a narrower question.')

        sources = list(state['sources'])
        evidence = list(state['evidence'])
        tools_used = list(state['tools_used'])
        tool_messages = []

        for call in calls:
            name = call['name']
            if name not in available:
                output = 'This tool is not available.'
            else:
                try:
                    raw_output = available[name].invoke(call['args'])
                    parsed = json.loads(raw_output)
                    tools_used.append(name)

                    if name == 'search_documents':
                        offset = len(sources)
                        sources.extend(parsed)
                        output = json.dumps([
                            dict(source, source_id=f'S{offset + index + 1}')
                            for index, source in enumerate(parsed)
                        ])
                    elif name == 'summarize_document':
                        new_sources = parsed['sources']
                        offset = len(sources)
                        sources.extend(new_sources)
                        output = json.dumps({
                            'summary': parsed['summary'],
                            'sources': [
                                dict(source, source_id=f'S{offset + index + 1}')
                                for index, source in enumerate(new_sources)
                            ],
                        })
                    else:
                        evidence.append(parsed)
                        output = raw_output
                except (ValueError, HTTPException):
                    output = 'Invalid tool arguments or document unavailable in this project.'

            tool_messages.append(ToolMessage(content=output, tool_call_id=call['id']))

        return {
            'messages': tool_messages,
            'sources': sources,
            'evidence': evidence,
            'tools_used': tools_used,
        }

    def route_tools(state: AgentState) -> str:
        return 'finalize' if state['rounds'] >= MAX_AGENT_ROUNDS else 'call_model'

    def finalize(state: AgentState):
        if not state['sources'] and not state['evidence']:
            return {
                'answer': 'No project evidence was found. Try a narrower question or index your documents.',
                'citations': [],
            }
        answer, citations = service.grounded(
            question,
            state['sources'],
            history,
            extra=state['evidence'] or None,
        )
        return {'answer': answer, 'citations': citations}

    builder = StateGraph(AgentState)
    builder.add_node('call_model', call_model)
    builder.add_node('execute_tools', execute_tools)
    builder.add_node('finalize', finalize)
    builder.add_edge(START, 'call_model')
    builder.add_conditional_edges('call_model', route_model, {
        'execute_tools': 'execute_tools',
        'finalize': 'finalize',
    })
    builder.add_conditional_edges('execute_tools', route_tools, {
        'call_model': 'call_model',
        'finalize': 'finalize',
    })
    builder.add_edge('finalize', END)
    graph = builder.compile()

    result = graph.invoke({
        'messages': [
            SystemMessage(content=system_prompt + '\nUse tools before answering. Maximum 4 rounds.'),
            HumanMessage(content=json.dumps({'question': question, 'history': history[-6:]})),
        ],
        'sources': [],
        'evidence': [],
        'tools_used': [],
        'rounds': 0,
        'answer': '',
        'citations': [],
    }, config={'recursion_limit': 16})
    return result['answer'], result['citations'], result['tools_used']
