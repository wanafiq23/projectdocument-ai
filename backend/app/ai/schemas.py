"""Validated inputs and structured model outputs for AI operations."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message: str = Field(min_length=1, max_length=4000)
    requestId: UUID
    mode: Literal['documents', 'data', 'agent', 'summary'] = 'documents'
    documentId: UUID | None = None

    @field_validator('message', mode='before')
    @classmethod
    def strip_message(cls, value):
        return value.strip() if isinstance(value, str) else value


class GroundedAnswer(BaseModel):
    answer: str = Field(description='Answer using only supplied evidence. Use source IDs like [S1] for document claims.')
    source_ids: list[str] = Field(description='IDs of supplied document sources actually used, or [] when none support the answer.')


class TaskQuery(BaseModel):
    status: Literal['To Do', 'In Progress', 'Done'] | None = None
    priority: Literal['Low', 'Medium', 'High'] | None = None
    title_contains: str | None = Field(default=None, max_length=120)
    due_before: date | None = None
    due_after: date | None = None
    overdue: bool = False
    limit: int = Field(default=30, ge=1, le=100)
