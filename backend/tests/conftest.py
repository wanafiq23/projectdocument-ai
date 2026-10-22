import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from tests.db_support import create_test_schema, drop_test_schema, scoped_url


@pytest.fixture
def app(tmp_path):
    schema = create_test_schema()
    application = create_app(Settings(database_url=scoped_url(schema), upload_dir=tmp_path / 'uploads', gemini_api_key=None, mongodb_uri=None))
    yield application
    drop_test_schema(schema)


@pytest.fixture
def client(app):
    with TestClient(app, base_url='http://localhost', headers={'X-ProjectDocumentAI-Request': '1', 'Origin': 'http://localhost:5173'}) as client:
        yield client
