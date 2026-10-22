# ProjectDocumentAI backend

The FastAPI application, Python dependencies, database migrations, and API tests live entirely in this folder.

From this folder, first-time setup on Windows:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
Copy-Item .env.example .env
```

Create the `projectdocumentai` database in pgAdmin on the local PostgreSQL 18 server, set `POSTGRES_PASSWORD` in `.env`, and apply migrations once:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Start the complete application from the repository root:

```powershell
cd ..
npm.cmd run dev
```

The launcher starts FastAPI and React in one terminal. Open **http://localhost:5173** and press Ctrl+C once to stop both services. The API listens on **http://127.0.0.1:8000**; check `/api/health` for database connectivity and `/api/openapi.json` for the OpenAPI schema. To debug only the API, run `.\.venv\Scripts\python.exe run.py` from this backend folder.

Tasks and document metadata/text are stored in PostgreSQL. Uploaded originals are saved under `.local/uploads/` by default; set `UPLOAD_DIR` to choose another local directory. PDF, DOCX, and UTF-8 TXT extraction runs during upload. Keep both the database and upload directory when moving or backing up the workspace.

Run API tests:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

The backend connects to `localhost:5432/projectdocumentai` using the password in `.env`.

On macOS/Linux, use `.venv/bin/python`. Native PostgreSQL is required. Full configuration and API details are in the [project README](../README.md).


## AI and updated scope

See [the root README](../README.md) for MongoDB Atlas/Gemini setup and the current one-page Project Workspace specification.

Create a real Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Set `GEMINI_API_KEY` and `MONGODB_URI` in `.env`, run scripts/setup_atlas.py, wait for the Atlas vector index to be ready, and restart the API. LangChain provides the Gemini and retrieval integrations, while LangGraph orchestrates the bounded read-only agent workflow. AI credentials remain server-side.

The document extraction cache remains in PostgreSQL for local previews. Indexing writes page-aware document content, vector chunks, and embeddings into Atlas. Chat history is stored in Atlas per user/project. Existing uploads can be indexed or retried from the workspace document library.

Gemini handles both chat (`gemini-3.5-flash-lite`) and embeddings (`gemini-embedding-001`, 1,536 dimensions). Use **Index for AI** on existing documents after changing embedding providers. Keep credentials in this backend folder and restart the API after editing `.env`.

The AI implementation is organized under `app/ai/`. `AIService` remains the public entry point, while provider connections, retrieval and indexing, grounded chat and summaries, project-data queries, prompts, schemas, extraction, and the LangGraph agent live in focused modules. Existing callers continue to use:

```python
from app.ai import AIService
```
