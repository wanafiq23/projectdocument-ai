"""Grounded responses, summaries, and MongoDB-backed conversation history."""

import json
import re

from fastapi import HTTPException
from sqlalchemy import select

from ..models import Document
from ..storage import stored_path
from .extraction import extract_pages, split_pages
from .prompts import SYSTEM
from .schemas import GroundedAnswer


class ChatMixin:
    def history(self, user_id, project_id):
        if not self.settings.mongodb_uri:
            return []
        turns = list(self.database.chat_turns.find(
            {'user_id': str(user_id), 'project_id': str(project_id), 'status': 'complete'},
            {'messages': 1, 'created_at': 1},
        ).sort('created_at', -1).limit(100))
        return [message for turn in reversed(turns) for message in turn['messages']]

    def clear_history(self, user_id, project_id):
        if self.settings.mongodb_uri:
            self.database.chat_turns.delete_many({
                'user_id': str(user_id),
                'project_id': str(project_id),
            })

    def grounded(self, question, sources, history=None, extra=None):
        from langchain_core.messages import HumanMessage, SystemMessage

        evidence = [dict(source, source_id=f'S{index + 1}') for index, source in enumerate(sources)]
        answer = self.llm.with_structured_output(GroundedAnswer).invoke([
            SystemMessage(content=SYSTEM),
            HumanMessage(content=json.dumps({
                'question': question,
                'document_evidence': evidence,
                'database_evidence': extra,
                'history': (history or [])[-6:],
            }, default=str)),
        ])
        valid_ids = {f'S{index + 1}': source for index, source in enumerate(sources)}
        mentioned = set(re.findall(r'\[(S\d+)\]', answer.answer))
        if not mentioned.issubset(valid_ids):
            return 'The answer included an unsupported source reference. Please try again.', []
        cited = list(dict.fromkeys(
            source_id
            for source_id in [*answer.source_ids, *sorted(mentioned)]
            if source_id in valid_ids
        ))
        if sources and not cited and extra is None:
            return (
                'I could not support an answer with the available document sources. '
                'Try a more specific question.',
                [],
            )
        citations = []
        for source_id in cited:
            source = valid_ids[source_id]
            page, chunk = source.get('page'), source.get('chunk')
            location = f'Page {page}, chunk {chunk}' if page else f'Chunk {chunk}'
            citations.append({
                'sourceId': source_id,
                'documentId': source['documentId'],
                'name': source['name'],
                'location': location,
                'page': page,
                'chunk': chunk,
                'excerpt': source['text'],
            })
        return answer.answer, citations

    def summary(self, db, project_id, document_id):
        document = db.scalar(select(Document).where(
            Document.id == document_id,
            Document.project_id == project_id,
        ))
        if not document:
            raise HTTPException(404, 'Document not found in this project.')
        if document.processing_status != 'ready':
            raise HTTPException(422, 'This document has no extracted text to summarize.')
        if len(document.extracted_text) > 100_000:
            raise HTTPException(
                422,
                'For summarisation, split documents longer than 100,000 characters into smaller files.',
            )
        pages = document.pages or extract_pages(
            document.file_type,
            stored_path(self.settings.upload_dir, document.storage_key).read_bytes(),
        )
        chunks = split_pages(pages)
        sources = [
            {'documentId': str(document.id), 'name': document.name, **chunk}
            for chunk in chunks
        ]
        if len(sources) <= 12:
            return self.grounded(
                'Summarize this entire document: key points, decisions, dates, and action items.',
                sources,
            )

        # Map all chunks, then reduce; retain each source ID in the original source list.
        from langchain_core.messages import HumanMessage, SystemMessage

        partials = []
        for start in range(0, len(sources), 12):
            evidence = [
                dict(source, source_id=f'S{start + index + 1}')
                for index, source in enumerate(sources[start:start + 12])
            ]
            partial = self.llm.with_structured_output(GroundedAnswer).invoke([
                SystemMessage(content=SYSTEM),
                HumanMessage(content='Summarize these excerpts and retain source IDs. ' + json.dumps(evidence)),
            ])
            partials.append(partial.model_dump())
        source_ids = {source_id for partial in partials for source_id in partial['source_ids']}
        selected = [
            source
            for index, source in enumerate(sources)
            if f'S{index + 1}' in source_ids
        ]
        if not selected:
            return 'A supported summary could not be generated. Please try again.', []
        # Final stage uses original evidence, not unverified model statements.
        return self.grounded(
            'Write a concise document summary across these selected key excerpts. '
            'Include decisions, dates, and action items when supported.',
            selected[:60],
        )
