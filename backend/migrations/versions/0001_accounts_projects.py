"""Accounts, sessions, project membership and owner permissions."""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('roles', sa.Column('name', sa.String(30), primary_key=True))
    op.create_table('permissions', sa.Column('code', sa.String(40), primary_key=True))
    op.create_table('role_permissions',
        sa.Column('role_name', sa.String(30), sa.ForeignKey('roles.name', ondelete='CASCADE'), primary_key=True),
        sa.Column('permission_code', sa.String(40), sa.ForeignKey('permissions.code', ondelete='CASCADE'), primary_key=True))
    op.create_table('users',
        sa.Column('id', sa.Uuid, primary_key=True),
        sa.Column('name', sa.String(80), nullable=False),
        sa.Column('email', sa.String(254), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_table('auth_sessions',
        sa.Column('token_hash', sa.String(64), primary_key=True),
        sa.Column('user_id', sa.Uuid, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_auth_sessions_user_id', 'auth_sessions', ['user_id'])
    op.create_index('ix_auth_sessions_expires_at', 'auth_sessions', ['expires_at'])
    op.create_table('projects',
        sa.Column('id', sa.Uuid, primary_key=True),
        sa.Column('name', sa.String(80), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('category', sa.String(80), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('color', sa.String(20), nullable=False),
        sa.Column('due_date', sa.Date, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('Planning', 'In Progress', 'Completed')", name='project_status'),
        sa.CheckConstraint("color IN ('sage', 'lavender', 'peach', 'blue')", name='project_color'))
    op.create_table('project_memberships',
        sa.Column('project_id', sa.Uuid, sa.ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Uuid, sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('role_name', sa.String(30), sa.ForeignKey('roles.name'), nullable=False))
    op.create_index('ix_project_memberships_user_id', 'project_memberships', ['user_id'])
    op.bulk_insert(sa.table('roles', sa.column('name', sa.String)), [{'name': 'owner'}])
    permissions = ['project:read', 'project:write', 'project:delete']
    op.bulk_insert(sa.table('permissions', sa.column('code', sa.String)), [{'code': item} for item in permissions])
    op.bulk_insert(sa.table('role_permissions', sa.column('role_name', sa.String), sa.column('permission_code', sa.String)),
                   [{'role_name': 'owner', 'permission_code': item} for item in permissions])


def downgrade():
    for table in ('project_memberships', 'projects', 'auth_sessions', 'users', 'role_permissions', 'permissions', 'roles'):
        op.drop_table(table)
