"""Persist project tasks and uploaded documents."""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('tasks',
        sa.Column('id', sa.Uuid, primary_key=True),
        sa.Column('project_id', sa.Uuid, sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(120), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('priority', sa.String(10), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('due_date', sa.Date, nullable=False),
        sa.Column('assignee', sa.String(80), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('To Do', 'In Progress', 'Done')", name='task_status'),
        sa.CheckConstraint("priority IN ('Low', 'Medium', 'High')", name='task_priority'))
    op.create_index('ix_tasks_project_id', 'tasks', ['project_id'])
    op.create_table('documents',
        sa.Column('id', sa.Uuid, primary_key=True),
        sa.Column('project_id', sa.Uuid, sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('file_type', sa.String(8), nullable=False),
        sa.Column('size', sa.Integer, nullable=False),
        sa.Column('storage_key', sa.String(100), nullable=False, unique=True),
        sa.Column('extracted_text', sa.Text, nullable=False),
        sa.Column('processing_status', sa.String(10), nullable=False),
        sa.Column('processing_error', sa.String(300), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("file_type IN ('PDF', 'DOCX', 'TXT')", name='document_type'),
        sa.CheckConstraint("processing_status IN ('ready', 'empty', 'failed')", name='document_processing_status'))
    op.create_index('ix_documents_project_id', 'documents', ['project_id'])


def downgrade():
    op.drop_table('documents')
    op.drop_table('tasks')
