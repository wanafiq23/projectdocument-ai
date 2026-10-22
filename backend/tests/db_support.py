"""Isolated PostgreSQL schemas for API and browser integration tests."""
import re
import shutil
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import BACKEND_DIR, Settings


def scoped_url(schema: str) -> str:
    if not re.fullmatch(r'projectdocumentai_test_[0-9a-f]{32}', schema):
        raise ValueError('Refusing to use an unexpected test schema name.')
    return make_url(Settings().database_url).update_query_dict({'options': f'-csearch_path={schema}'}).render_as_string(hide_password=False)


def create_test_schema() -> str:
    schema = f'projectdocumentai_test_{uuid4().hex}'
    engine = create_engine(Settings().database_url)
    with engine.begin() as db:
        db.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine.dispose()
    config = Config(str(BACKEND_DIR / 'alembic.ini'))
    config.attributes['database_url'] = scoped_url(schema)
    command.upgrade(config, 'head')
    return schema


def drop_test_schema(schema: str):
    scoped_url(schema)  # Validate the exact generated name before removing it.
    engine = create_engine(Settings().database_url)
    with engine.begin() as db:
        db.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def remove_browser_test_uploads():
    local = (BACKEND_DIR / '.local').resolve()
    target = (local / 'browser-test-uploads').resolve()
    if target.parent != local:
        raise ValueError('Refusing to remove files outside the project test directory.')
    if target.exists():
        shutil.rmtree(target)
