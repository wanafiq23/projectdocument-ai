"""Authenticated project-scoped AI and chat history endpoints."""
import logging
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request, Response
from ..ai.schemas import ChatInput
from ..database import DB
from ..security import CurrentUser, require_project

router = APIRouter(prefix='/api/ai', tags=['AI Assistant'])
log = logging.getLogger(__name__)


def protected_call(operation):
    try:
        return operation()
    except HTTPException:
        raise
    except Exception as error:
        # Provider exceptions can contain credentials or document text.
        log.warning('AI provider operation failed (%s)', type(error).__name__)
        raise HTTPException(503, 'The AI service is unavailable. Check Atlas connectivity, the vector index, and Gemini access, then retry.') from None


@router.get('/status')
def status(request: Request, user: CurrentUser):
    ai = request.app.state.ai
    return {'configured': ai.configured,
            'geminiConfigured': bool(ai.settings.gemini_api_key and ai.settings.gemini_api_key.get_secret_value()),
            'mongodbConfigured': bool(ai.settings.mongodb_uri and ai.settings.mongodb_uri.get_secret_value()),
            'model': ai.settings.gemini_chat_model, 'embeddingModel': ai.settings.gemini_embedding_model,
            'note': 'Configuration presence only; a successful request verifies connectivity.'}


@router.get('/projects/{project_id}/messages')
def history(project_id: UUID, request: Request, user: CurrentUser, db: DB):
    require_project(db, user, project_id)
    return protected_call(lambda: request.app.state.ai.history(user.id, project_id))


@router.post('/projects/{project_id}/messages')
def chat(project_id: UUID, data: ChatInput, request: Request, user: CurrentUser, db: DB):
    project = require_project(db, user, project_id)
    return protected_call(lambda: request.app.state.ai.answer(db, project, user, data))


@router.delete('/projects/{project_id}/messages', status_code=204)
def clear(project_id: UUID, request: Request, user: CurrentUser, db: DB):
    require_project(db, user, project_id)
    protected_call(lambda: request.app.state.ai.clear_history(user.id, project_id))
    return Response(status_code=204)
