"""Run an isolated test API; never uses the normal workspace tables."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.config import Settings
from app.main import create_app
from tests.db_support import scoped_url, create_test_schema, drop_test_schema, remove_browser_test_uploads
import uvicorn

if __name__ == '__main__':
    state = ROOT / '.local' / 'browser-test.json'
    if state.exists():
        drop_test_schema(json.loads(state.read_text())['schema'])
    remove_browser_test_uploads()
    state.write_text(json.dumps({'schema': create_test_schema()}))
    settings = Settings(database_url=scoped_url(json.loads(state.read_text())['schema']), upload_dir=ROOT / '.local' / 'browser-test-uploads', gemini_api_key=None, mongodb_uri=None)
    settings.allowed_origins.extend(['http://localhost:5175', 'http://127.0.0.1:5175'])
    uvicorn.run(create_app(settings), host='127.0.0.1', port=8001)
