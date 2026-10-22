from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, JSON, String, Table, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


role_permissions = Table(
    'role_permissions', Base.metadata,
    Column('role_name', String(30), ForeignKey('roles.name', ondelete='CASCADE'), primary_key=True),
    Column('permission_code', String(40), ForeignKey('permissions.code', ondelete='CASCADE'), primary_key=True),
)


class Role(Base):
    __tablename__ = 'roles'
    name: Mapped[str] = mapped_column(String(30), primary_key=True)
    permissions: Mapped[list['Permission']] = relationship(secondary=role_permissions, lazy='selectin')


class Permission(Base):
    __tablename__ = 'permissions'
    code: Mapped[str] = mapped_column(String(40), primary_key=True)


class User(Base):
    __tablename__ = 'users'
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    user: Mapped[User] = relationship(lazy='joined')


class Project(Base):
    __tablename__ = 'projects'
    __table_args__ = (
        CheckConstraint("status IN ('Planning', 'In Progress', 'Completed')", name='project_status'),
        CheckConstraint("color IN ('sage', 'lavender', 'peach', 'blue')", name='project_color'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default='')
    category: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default='Planning')
    color: Mapped[str] = mapped_column(String(20), default='sage')
    due_date: Mapped[date]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    memberships: Mapped[list['ProjectMembership']] = relationship(
        back_populates='project', cascade='all, delete-orphan', passive_deletes=True, lazy='selectin',
    )


class ProjectMembership(Base):
    __tablename__ = 'project_memberships'
    project_id: Mapped[UUID] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, index=True)
    role_name: Mapped[str] = mapped_column(ForeignKey('roles.name'), default='owner')
    user: Mapped[User] = relationship(lazy='joined')
    role: Mapped[Role] = relationship(lazy='joined')
    project: Mapped[Project] = relationship(back_populates='memberships')


class Task(Base):
    __tablename__ = 'tasks'
    __table_args__ = (
        CheckConstraint("status IN ('To Do', 'In Progress', 'Done')", name='task_status'),
        CheckConstraint("priority IN ('Low', 'Medium', 'High')", name='task_priority'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default='')
    priority: Mapped[str] = mapped_column(String(10), default='Medium')
    status: Mapped[str] = mapped_column(String(20), default='To Do')
    due_date: Mapped[date]
    assignee: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Document(Base):
    __tablename__ = 'documents'
    __table_args__ = (
        CheckConstraint("file_type IN ('PDF', 'DOCX', 'TXT')", name='document_type'),
        CheckConstraint("processing_status IN ('ready', 'empty', 'failed')", name='document_processing_status'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), index=True)
    name: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(8))
    size: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(100), unique=True)
    extracted_text: Mapped[str] = mapped_column(Text, default='')
    processing_status: Mapped[str] = mapped_column(String(10))
    processing_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pages: Mapped[list] = mapped_column(JSON, default=list)
    indexing_status: Mapped[str] = mapped_column(String(20), default='not_indexed')
    indexing_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    index_generation: Mapped[str | None] = mapped_column(String(36), nullable=True)
