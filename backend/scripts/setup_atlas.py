"""Create ProjectDocumentAI collections and the required Atlas Vector Search index."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pymongo.operations import SearchIndexModel
from app.ai import AIService
from app.config import Settings


def main():
    settings = Settings()
    ai = AIService(settings)
    try:
        db = ai.database
        db.command('ping')
        existing_collections = db.list_collection_names()
        for name in ('chunks', 'document_content', 'chat_turns'):
            if name not in existing_collections:
                db.create_collection(name)
        db.chunks.create_index([('project_id', 1), ('document_id', 1)])
        db.chat_turns.create_index([('user_id', 1), ('project_id', 1), ('created_at', -1)])
        definition = {
            'fields': [
                {'type': 'vector', 'path': 'embedding', 'numDimensions': settings.embedding_dimensions, 'similarity': 'cosine'},
                {'type': 'filter', 'path': 'project_id'},
                {'type': 'filter', 'path': 'embedding_model'},
            ]
        }
        existing = list(db.chunks.list_search_indexes(settings.mongodb_vector_index))
        if existing:
            current = existing[0].get('latestDefinition', existing[0].get('definition'))
            if current and current != definition:
                raise RuntimeError('Existing index definition differs. Update it in Atlas using docs/atlas-vector-index.json.')
            print('Vector index already exists. Status:', existing[0].get('status', 'unknown'))
        else:
            db.chunks.create_search_index(SearchIndexModel(
                definition=definition, name=settings.mongodb_vector_index, type='vectorSearch'))
            print('Vector index creation requested. Wait for Ready in Atlas before using document chat.')
        print('Atlas collections configured. Upload a document or select Index for AI for existing files.')
    except Exception as error:
        # Do not expose a Mongo URI embedded in provider error messages.
        print('Atlas setup failed (' + type(error).__name__ + '). Check backend/.env, Atlas network access, database permissions, and index definition.')
        return 1
    finally:
        ai.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
