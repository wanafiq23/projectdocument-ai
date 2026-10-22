"""Use psycopg's supported Python implementation and native libpq."""
import os
from pathlib import Path
import shutil

_dll_handle = None


def configure_postgres_client():
    global _dll_handle
    os.environ.setdefault('PSYCOPG_IMPL', 'python')
    if os.name != 'nt':
        return
    directory = os.environ.get('POSTGRES_BIN')
    if not directory and shutil.which('psql'):
        directory = str(Path(shutil.which('psql')).parent)
    if not directory:
        candidates = sorted(Path('C:/Program Files/PostgreSQL').glob('*/bin/libpq.dll'), reverse=True)
        if candidates:
            directory = str(candidates[0].parent)
    if directory and Path(directory).is_dir():
        os.environ['PATH'] = directory + os.pathsep + os.environ.get('PATH', '')
        _dll_handle = os.add_dll_directory(directory)
