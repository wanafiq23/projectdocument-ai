"""Track page-aware extraction and Atlas indexing without replacing existing data."""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('documents', sa.Column('pages', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('documents', sa.Column('indexing_status', sa.String(20), nullable=False, server_default='not_indexed'))
    op.add_column('documents', sa.Column('indexing_error', sa.String(300), nullable=True))
    op.add_column('documents', sa.Column('index_generation', sa.String(36), nullable=True))


def downgrade():
    for name in ('index_generation', 'indexing_error', 'indexing_status', 'pages'):
        op.drop_column('documents', name)
