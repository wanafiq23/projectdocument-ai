import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .routes import auth, documents, projects, tasks, ai
from .ai import AIService

log = logging.getLogger('projectdocumentai')


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args={'connect_timeout': 5})

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            with engine.connect() as connection:
                connection.execute(text('SELECT 1 FROM alembic_version'))
        except SQLAlchemyError:
            engine.dispose()
            raise RuntimeError('PostgreSQL is unavailable or not initialized. Set POSTGRES_PASSWORD in backend/.env and run alembic upgrade head.') from None
        yield
        app.state.ai.close()
        engine.dispose()

    app = FastAPI(title='ProjectDocumentAI — local API', version='0.1.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url='/api/openapi.json')
    app.state.settings = settings
    app.state.ai = AIService(settings)
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    attempts: dict[str, deque] = defaultdict(deque)
    lock = Lock()

    @app.middleware('http')
    async def local_request_guards(request: Request, call_next):
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            if origin and origin not in settings.allowed_origins:
                return JSONResponse({'detail': 'This origin is not allowed.'}, status_code=403)
            if request.url.path.startswith('/api/') and request.headers.get('x-projectdocumentai-request') != '1':
                return JSONResponse({'detail': 'Missing request protection header.'}, status_code=403)
        if request.method == 'POST' and request.url.path in ('/api/auth/login', '/api/auth/register'):
            key = request.client.host if request.client else 'local'
            now = time.monotonic()
            with lock:
                bucket = attempts[key]
                while bucket and bucket[0] < now - 60:
                    bucket.popleft()
                if len(bucket) >= 30:
                    return JSONResponse({'detail': 'Too many attempts. Please wait one minute.'}, status_code=429, headers={'Retry-After': '60'})
                bucket.append(now)
        response = await call_next(request)
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                       allow_methods=['GET', 'POST', 'PUT', 'DELETE'], allow_headers=['Content-Type', 'X-ProjectDocumentAI-Request'])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', '[::1]'])

    @app.exception_handler(SQLAlchemyError)
    async def database_unavailable(request: Request, exception: SQLAlchemyError):
        log.error('Database operation failed: %s', type(exception).__name__)
        return JSONResponse({'detail': 'The local database is unavailable. Please try again shortly.'}, status_code=503)

    @app.get('/api/health', tags=['Health'])
    def health():
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        return {'status': 'ok', 'database': 'postgresql'}

    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(tasks.router)
    app.include_router(documents.router)
    app.include_router(ai.router)
    return app


app = create_app()
