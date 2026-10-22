from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / '.env', extra='ignore')

    database_url: str = 'postgresql+psycopg://postgres@localhost:5432/projectdocumentai'
    postgres_password: SecretStr | None = Field(default=None, validation_alias='POSTGRES_PASSWORD')
    upload_dir: Path = BACKEND_DIR / '.local' / 'uploads'
    mongodb_uri: SecretStr | None = None
    mongodb_database: str = 'projectdocumentai'
    mongodb_vector_index: str = 'projectdocumentai_vectors'
    gemini_api_key: SecretStr | None = None
    gemini_chat_model: str = 'gemini-3.5-flash-lite'
    gemini_embedding_model: str = 'gemini-embedding-001'
    embedding_dimensions: int = Field(default=1536, ge=256, le=3072)
    session_days: int = Field(default=7, ge=1, le=30)
    allowed_origins: list[str] = [
        f'http://{host}:{port}'
        for host in ('localhost', '127.0.0.1')
        for port in (5173, 5174, 4173, 8000)
    ]

    def __init__(self, **values):
        explicit_database_url = 'database_url' in values
        super().__init__(**values)
        password = self.postgres_password
        if password and password.get_secret_value() and not explicit_database_url:
            self.database_url = URL.create(
                'postgresql+psycopg',
                username='postgres',
                password=password.get_secret_value(),
                host='localhost',
                port=5432,
                database='projectdocumentai',
            ).render_as_string(hide_password=False)

    @field_validator('database_url')
    @classmethod
    def local_database_only(cls, value: str) -> str:
        url = make_url(value)
        if url.drivername != 'postgresql+psycopg' or url.host not in ('localhost', '127.0.0.1', '::1'):
            raise ValueError('Use a localhost PostgreSQL URL with the postgresql+psycopg driver.')
        return value


COOKIE_NAME = 'projectdocumentai_session'
