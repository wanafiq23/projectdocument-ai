from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..database import DB
from ..ai.extraction import extract_pages
from .ai import protected_call
from ..models import Document, ProjectMembership
from ..schemas import DocumentOut
from ..security import CurrentUser, require_project
from ..storage import remove_stored_file, stored_path

router = APIRouter(prefix='/api/documents', tags=['Documents'])
MAX_FILE_SIZE = 50 * 1024 * 1024
MEDIA_TYPES = {
    'PDF': 'application/pdf',
    'DOCX': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'TXT': 'text/plain; charset=utf-8',
}


def serialize(document: Document) -> DocumentOut:
    return DocumentOut(
        id=document.id, projectId=document.project_id, name=document.name,
        type=document.file_type, size=document.size, uploadedAt=document.uploaded_at,
        content=document.extracted_text[:100_000],
        processingStatus=document.processing_status,
        processingError=document.processing_error,
        indexingStatus=document.indexing_status, indexingError=document.indexing_error,
    )


def require_document(db: DB, user: CurrentUser, document_id: UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(404, 'Document not found.')
    require_project(db, user, document.project_id)
    return document


def process_document(file_type: str, payload: bytes) -> tuple[list[dict], str, str, str | None]:
    try:
        pages = extract_pages(file_type, payload)
        text = '\n\n'.join(page['text'] for page in pages).strip()
        return (pages, text, 'ready', None) if text else (pages, '', 'empty', 'No selectable text was found in this document.')
    except Exception:
        return [], '', 'failed', 'Text extraction failed or the document exceeds the extraction limit. The original file is still available.'


@router.get('', response_model=list[DocumentOut])
def list_documents(user: CurrentUser, db: DB):
    documents = db.scalars(select(Document).join(ProjectMembership, ProjectMembership.project_id == Document.project_id).where(
        ProjectMembership.user_id == user.id,
    ).order_by(Document.uploaded_at.desc())).all()
    return [serialize(document) for document in documents]


@router.post('/projects/{project_id}', response_model=DocumentOut, status_code=201)
def upload_document(project_id: UUID, request: Request, user: CurrentUser, db: DB, file: UploadFile = File(...)):
    require_project(db, user, project_id, 'project:write')
    name = (file.filename or '').replace('\\', '/').split('/')[-1].strip()
    if not name or len(name) > 255 or any(ord(character) < 32 for character in name):
        raise HTTPException(422, 'Choose a file with a valid name of 255 characters or fewer.')
    file_type = Path(name).suffix.upper().lstrip('.')
    if file_type not in MEDIA_TYPES:
        raise HTTPException(415, 'Choose a PDF, DOCX, or TXT file.')
    payload = file.file.read(MAX_FILE_SIZE + 1)
    if not payload or len(payload) > MAX_FILE_SIZE:
        raise HTTPException(413, 'Files must be nonempty and no larger than 50 MB.')
    pages, extracted_text, status, error = process_document(file_type, payload)
    document_id = uuid4()
    storage_key = f'{project_id}/{document_id}.{file_type.lower()}'
    path = stored_path(request.app.state.settings.upload_dir, storage_key)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    except OSError:
        remove_stored_file(request.app.state.settings.upload_dir, storage_key)
        raise HTTPException(503, 'The local file store is unavailable.') from None
    document = Document(
        id=document_id, project_id=project_id, name=name, file_type=file_type,
        size=len(payload), storage_key=storage_key, extracted_text=extracted_text,
        processing_status=status, processing_error=error,
        pages=pages,
    )
    try:
        db.add(document)
        db.commit()
        db.refresh(document)
    except Exception:
        remove_stored_file(request.app.state.settings.upload_dir, storage_key)
        raise
    if status == 'ready':
        request.app.state.ai.index_document(document, db)
    return serialize(document)


@router.get('/{document_id}/file')
def download_document(document_id: UUID, request: Request, user: CurrentUser, db: DB):
    document = require_document(db, user, document_id)
    path = stored_path(request.app.state.settings.upload_dir, document.storage_key)
    if not path.is_file():
        raise HTTPException(404, 'The original file is unavailable.')
    return FileResponse(
        path, media_type=MEDIA_TYPES[document.file_type], filename=document.name,
        content_disposition_type='inline' if document.file_type == 'PDF' else 'attachment',
    )


@router.delete('/{document_id}', status_code=204)
def delete_document(document_id: UUID, request: Request, user: CurrentUser, db: DB):
    document = require_document(db, user, document_id)
    require_project(db, user, document.project_id, 'project:write')
    protected_call(lambda: request.app.state.ai.delete_document(document))
    storage_key = document.storage_key
    db.delete(document)
    db.commit()
    remove_stored_file(request.app.state.settings.upload_dir, storage_key)
    return Response(status_code=204)


@router.post('/{document_id}/index', response_model=DocumentOut)
def index_document(document_id: UUID, request: Request, user: CurrentUser, db: DB):
    document = require_document(db, user, document_id)
    require_project(db, user, document.project_id, 'project:write')
    if document.processing_status != 'ready':
        raise HTTPException(422, 'This document has no extracted text to index.')
    request.app.state.ai.require_configured()
    request.app.state.ai.index_document(document, db)
    return serialize(document)
