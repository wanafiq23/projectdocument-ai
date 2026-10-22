from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator('email', mode='before')
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower() if isinstance(value, str) else value


class RegisterInput(LoginInput):
    name: str = Field(min_length=2, max_length=80)

    @field_validator('name', mode='before')
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    email: str


class ProjectInput(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default='', max_length=500)
    category: str = Field(min_length=1, max_length=80)
    status: Literal['Planning', 'In Progress', 'Completed'] = 'Planning'
    color: Literal['sage', 'lavender', 'peach', 'blue'] = 'sage'
    due_date: date = Field(alias='dueDate')

    @field_validator('name', 'description', 'category', mode='before')
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class ProjectOut(ProjectInput):
    id: UUID
    created_at: datetime = Field(alias='createdAt')
    members: list[str]


class TaskInput(BaseModel):
    model_config = ConfigDict(extra='forbid', populate_by_name=True)
    project_id: UUID = Field(alias='projectId')
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=1000)
    priority: Literal['Low', 'Medium', 'High'] = 'Medium'
    status: Literal['To Do', 'In Progress', 'Done'] = 'To Do'
    due_date: date = Field(alias='dueDate')
    assignee: str = Field(min_length=1, max_length=80)

    @field_validator('title', 'description', 'assignee', mode='before')
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class TaskOut(TaskInput):
    id: UUID


class DocumentOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: UUID
    project_id: UUID = Field(alias='projectId')
    name: str
    type: Literal['PDF', 'DOCX', 'TXT']
    size: int
    uploaded_at: datetime = Field(alias='uploadedAt')
    content: str
    processing_status: Literal['ready', 'empty', 'failed'] = Field(alias='processingStatus')
    processing_error: str | None = Field(alias='processingError')

    indexing_status: str = Field(default='not_indexed', alias='indexingStatus')
    indexing_error: str | None = Field(default=None, alias='indexingError')


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=2, max_length=80)

    @field_validator('name', mode='before')
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class PasswordInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    current_password: str = Field(min_length=8, max_length=128, alias='currentPassword')
    new_password: str = Field(min_length=8, max_length=128, alias='newPassword')
