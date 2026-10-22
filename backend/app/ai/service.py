"""Public AI service façade and request-mode orchestration."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from .agent_graph import run_agent_graph
from .chat import ChatMixin
from .project_data import ProjectDataMixin
from .prompts import SYSTEM
from .providers import ProviderMixin
from .retrieval import RetrievalMixin


class AIService(ProviderMixin, RetrievalMixin, ChatMixin, ProjectDataMixin):
    """Coordinate provider, retrieval, chat, data, and agent operations."""

    def __init__(self, settings):
        self.settings = settings

    def agent(self, db, project, question, history):
        return run_agent_graph(self, db, project, question, history, SYSTEM)

    def answer(self, db, project, user, payload):
        self.require_configured()
        from pymongo.errors import DuplicateKeyError

        key = f'{user.id}:{project.id}:{payload.requestId}'
        existing = self.database.chat_turns.find_one({'_id': key})
        if existing:
            if existing.get('input') != payload.model_dump(mode='json'):
                raise HTTPException(409, 'This request ID belongs to a different message.')
            if existing['status'] == 'complete':
                return existing['messages']
            raise HTTPException(409, 'This message is already processing. Reload history before retrying.')

        now = datetime.now(timezone.utc).isoformat()
        try:
            self.database.chat_turns.insert_one({
                '_id': key,
                'user_id': str(user.id),
                'project_id': str(project.id),
                'created_at': now,
                'status': 'pending',
                'input': payload.model_dump(mode='json'),
            })
        except DuplicateKeyError:
            raise HTTPException(409, 'This message is already processing.') from None

        try:
            history = self.history(user.id, project.id)[-6:]
            trace = []
            if payload.mode == 'summary':
                if not payload.documentId:
                    raise HTTPException(422, 'Choose a document to summarize.')
                answer, citations = self.summary(db, project.id, payload.documentId)
            elif payload.mode == 'data':
                answer, citations = self.database_answer(db, project, payload.message)
                trace = ['query_project_database']
            elif payload.mode == 'agent':
                answer, citations, trace = self.agent(db, project, payload.message, history)
            else:
                retrieval_question = payload.message
                if history:
                    retrieval_question = (
                        '\n'.join(
                            message['text'][:1000]
                            for message in history
                            if message['role'] == 'user'
                        )
                        + '\n'
                        + payload.message
                    )
                sources = self.retrieve(db, project.id, retrieval_question)
                if sources:
                    answer, citations = self.grounded(payload.message, sources, history)
                else:
                    answer = (
                        'I could not find indexed sources for that question in this project. '
                        'Upload or index documents, then try again.'
                    )
                    citations = []

            messages = [
                {
                    'id': str(uuid4()),
                    'projectId': str(project.id),
                    'role': 'user',
                    'text': payload.message,
                    'createdAt': now,
                },
                {
                    'id': str(uuid4()),
                    'projectId': str(project.id),
                    'role': 'assistant',
                    'text': answer,
                    'citations': citations,
                    'toolsUsed': trace,
                    'mode': payload.mode,
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                },
            ]
            self.database.chat_turns.update_one(
                {'_id': key},
                {'$set': {'status': 'complete', 'messages': messages}},
            )
            return messages
        except Exception:
            self.database.chat_turns.delete_one({'_id': key, 'status': 'pending'})
            raise
