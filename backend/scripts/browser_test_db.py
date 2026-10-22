"""Create or remove only the database schema owned by this browser test run."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tests.db_support import create_test_schema, drop_test_schema, remove_browser_test_uploads

state = ROOT / '.local' / 'browser-test.json'
if sys.argv[1] == 'create':
    if state.exists():
        drop_test_schema(json.loads(state.read_text())['schema'])
    remove_browser_test_uploads()
    state.parent.mkdir(exist_ok=True)
    state.write_text(json.dumps({'schema': create_test_schema()}))
elif sys.argv[1] == 'drop' and state.exists():
    drop_test_schema(json.loads(state.read_text())['schema'])
    remove_browser_test_uploads()
    state.unlink()
