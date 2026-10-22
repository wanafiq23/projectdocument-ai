"""Document indexing, cleanup, and project-scoped vector retrieval."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from ..models import Document
from ..storage import stored_path
from .extraction import extract_pages, split_pages

log = logging.getLogger(__name__)


class RetrievalMixin:
    def index_document(self, document, db):
        if not self.configured:
            document.indexing_status = 'not_configured'
            document.indexing_error = 'Configure Atlas and Gemini, then select Index for AI.'
            db.commit()
            return
        generation = str(uuid4())
        try:
            # Lock the document against concurrent indexing/deletion.
            db.execute(select(Document.id).where(Document.id == document.id).with_for_update())
            document.indexing_status = 'indexing'
            if not document.pages:
                document.pages = extract_pages(
                    document.file_type,
                    stored_path(self.settings.upload_dir, document.storage_key).read_bytes(),
                )
            chunks = split_pages(document.pages)
            if not chunks:
                raise ValueError('No text to index')
            from langchain_core.documents import Document as LCDocument

            records = [LCDocument(page_content=item['text'], metadata={
                'project_id': str(document.project_id),
                'document_id': str(document.id),
                'generation': generation,
                'name': document.name,
                'page': item['page'],
                'chunk': item['chunk'],
                'embedding_model': self.settings.gemini_embedding_model,
            }) for item in chunks]
            self.vector_store.add_documents(records)
            self.database.document_content.update_one({'_id': str(document.id)}, {'$set': {
                'project_id': str(document.project_id),
                'name': document.name,
                'pages': document.pages,
                'generation': generation,
                'updated_at': datetime.now(timezone.utc),
            }}, upsert=True)
            document.index_generation = generation
            document.indexing_status = 'indexed'
            document.indexing_error = None
            db.commit()
            # Stale generations are also rejected at retrieval time.
            try:
                self.database.chunks.delete_many({
                    'document_id': str(document.id),
                    'generation': {'$ne': generation},
                })
            except Exception as cleanup_error:
                log.warning('Old index cleanup failed (%s)', type(cleanup_error).__name__)
        except Exception as error:
            log.warning('AI indexing failed (%s)', type(error).__name__)
            db.rollback()
            document.indexing_status = 'failed'
            document.indexing_error = (
                'Indexing failed. Check Atlas, its vector index, and Gemini credentials; then retry.'
            )
            db.commit()

    def delete_document(self, document):
        if document.index_generation or self.settings.mongodb_uri:
            self.database.chunks.delete_many({
                'document_id': str(document.id),
                'project_id': str(document.project_id),
            })
            self.database.document_content.delete_one({
                '_id': str(document.id),
                'project_id': str(document.project_id),
            })

    def delete_project(self, project_id):
        if self.settings.mongodb_uri:
            query = {'project_id': str(project_id)}
            for collection in ('chunks', 'document_content', 'chat_turns'):
                self.database[collection].delete_many(query)

    def retrieve(self, db, project_id, question):
        # The filter is server-generated and cannot be changed by the user/model.
        hits = self.vector_store.similarity_search(question, k=10, pre_filter={
            'project_id': {'$eq': str(project_id)},
            'embedding_model': {'$eq': self.settings.gemini_embedding_model},
        })
        documents = {
            str(document.id): document
            for document in db.scalars(select(Document).where(Document.project_id == project_id))
        }
        sources = []
        for hit in hits:
            metadata = hit.metadata
            document = documents.get(metadata.get('document_id'))
            if not document or document.index_generation != metadata.get('generation'):
                continue
            sources.append({
                'documentId': str(document.id),
                'name': document.name,
                'page': metadata.get('page'),
                'chunk': metadata.get('chunk'),
                'text': hit.page_content,
            })
            if len(sources) == 6:
                break
        return sources
