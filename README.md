# ProjectDocumentAI

A full-stack project management and document intelligence platform.

**Stack:** React + TypeScript + Vite, FastAPI + Python, PostgreSQL, MongoDB Atlas Vector Search, LangChain, LangGraph, and Gemini.

## Page

The application has one main page: **Project Workspace**. Signed-out users see Login/Register before entering the workspace, while Profile/Settings opens as a modal.

Project creation, switching, editing, and deletion live in the left sidebar beside the document library. The assistant remains in the main area, while task management opens in a focused drawer. Document upload, preview, indexing, and deletion all happen in the library. Legacy URLs, including `/dashboard`, redirect into this one-page workspace.

The current scope is recorded in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md). It replaces the original six-page, pgvector, entirely local specification.

## Architecture at a glance

ProjectDocumentAI uses a single-page React interface backed by a FastAPI service. After authentication, `ProjectWorkspace.tsx` provides the workspace shell, the `features/ai-chat/` modules power the main assistant, `Tasks.tsx` appears in an on-demand drawer, and `WorkspaceDocumentSidebar.tsx` manages project files. Authentication and workspace state are grouped into feature modules, keeping the interface minimal without merging unrelated logic into one large component.

The frontend calls authenticated FastAPI routes for projects, tasks, documents, and AI operations. PostgreSQL stores application records, while MongoDB Atlas stores indexed document content, vectors, and project-specific chat history. The AI package uses LangChain for model and retrieval integrations, Gemini for generation and embeddings, and LangGraph to coordinate the bounded, read-only agent workflow.

### How the application connects

```text
React interface
    |
    v
FastAPI routes
    |
    +--> PostgreSQL
    |    Users, sessions, projects, tasks, permissions,
    |    document metadata, extracted text and indexing status
    |
    +--> MongoDB Atlas
    |    Document content, vector embeddings and chat history
    |
    +--> LangChain + Gemini
             |
             +--> Document retrieval, cited answers and summaries
             |
             +--> LangGraph read-only agent workflow
```

### Where to start

| Area | Starting file | Responsibility |
|---|---|---|
| Frontend routes | `frontend/src/App.tsx` | Authentication gates, redirects and workspace routes |
| Main workspace | `frontend/src/pages/ProjectWorkspace.tsx` | One-page workspace layout and drawers |
| AI assistant | `frontend/src/features/ai-chat/AIChat.tsx` | Chat orchestration, with focused composer, message-list and formatting components |
| Authentication state | `frontend/src/features/auth/AuthContext.tsx` | Current user, session refresh and account actions |
| Workspace state | `frontend/src/features/workspace/WorkspaceContext.tsx` | In-memory workspace state and UI notifications |
| Workspace API | `frontend/src/features/workspace/workspaceApi.ts` | Project, task and document persistence calls |
| Document library | `frontend/src/components/WorkspaceDocumentSidebar.tsx` | Upload, preview, indexing and deletion |
| Task management | `frontend/src/pages/Tasks.tsx` | Task board/list and task controls |
| Backend application | `backend/app/main.py` | FastAPI setup, middleware and route registration |
| API endpoints | `backend/app/routes/` | Authentication, projects, tasks, documents and AI routes |
| AI orchestration | `backend/app/ai/service.py` | Selects and runs the requested AI mode |
| LangGraph workflow | `backend/app/ai/agent_graph.py` | Coordinates bounded read-only tools |
| Database models | `backend/app/models.py` | PostgreSQL tables and relationships |

`ProjectWorkspace.tsx` is the only signed-in page. `AIChat` and `Tasks` are features rendered inside that page, while `ProfileSettings.tsx` is displayed in a modal. `LoginRegister.tsx` is the signed-out entry screen.

### Document question workflow

```text
Upload document
    -> extract and validate text
    -> split text into page-aware chunks
    -> create Gemini embeddings
    -> store searchable vectors in MongoDB Atlas
    -> retrieve project-scoped evidence for a question
    -> generate an answer with verified source citations
```

## Features

- Registration, login/logout, sessions, profile name and password changes.
- Project CRUD and tasks with priority, due date, assignee, To Do / In Progress / Done.
- PDF, DOCX, and UTF-8 TXT upload; extraction; preview/download; deletion.
- Automatic document indexing when AI credentials are configured; Index for AI retries and indexes older files.
- Project-scoped RAG chat with document/page/chunk citations.
- Document summarisation, natural-language project/task queries, and agent tool calling.
- MongoDB chat history scoped to the signed-in user and selected project.
- Responsive minimalist UI with a desktop document library and mobile library drawer.

**AI needs configuration.** No fake replies are generated. Without Atlas/Gemini credentials, the management features continue working and the assistant displays a setup message. Automated AI tests use controlled provider doubles; live service behavior requires your own configured accounts.

## Folder structure

```text
projectdocument-ai/
  frontend/
    src/components/         Reusable UI, forms, layout, document preview
    src/features/           AI chat, authentication and workspace feature modules
    src/pages/              Focused workspace and signed-out entry views
    src/lib/                Shared API client and utilities
    tests/                  Browser integration tests
  backend/
    app/routes/             REST APIs: auth, projects, tasks, documents, AI
    app/ai/                 AI service package and public AIService facade
      service.py            Request-mode orchestration
      providers.py          Gemini, Atlas, and vector-store connections
      retrieval.py          Document indexing and scoped vector retrieval
      chat.py               Grounded answers, summaries, and chat history
      project_data.py       Read-only task queries and project statistics
      agent_graph.py        Bounded LangGraph workflow and agent tools
      prompts.py            Grounding and safety instructions
      schemas.py            Typed AI responses and allowed database filters
      gemini.py             Retrieval embedding normalization
      extraction.py         Text extraction and page-aware splitting
    app/models.py           SQLAlchemy PostgreSQL models
    migrations/             Additive Alembic migrations
    scripts/setup_atlas.py  Atlas collections and vector index setup
    tests/                  API and provider-boundary tests
  docs/
    PROJECT_SPEC.md
    atlas-vector-index.json
```

## Local setup (Windows, no Docker)

Prerequisites: Node.js 22+, Python 3.11+ (tested with 3.14), native PostgreSQL (tested with 18), an Atlas cluster with Vector Search, and a Gemini API account.

Open the project folder in VS Code.

### 1. Backend dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
```

For an existing environment, just run the dependency installation command. **Preserve your existing `.env`.** On a fresh checkout only, copy `.env.example` to `.env`.

### 2. PostgreSQL

Create the `projectdocumentai` database in pgAdmin on `localhost:5432`. Set `POSTGRES_PASSWORD` in `backend/.env` to your local postgres password. Alternatively use a local `DATABASE_URL` and leave `POSTGRES_PASSWORD` blank.

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Existing accounts/projects/files are preserved by the migrations. SQL stores users, sessions, roles, permissions, projects, memberships, tasks, document metadata, extraction cache, and indexing state. Original files live in `backend/.local/uploads/`. Back up the PostgreSQL database and uploads together.

### 3. Atlas and Gemini

Create a real Gemini Developer API key in [Google AI Studio](https://aistudio.google.com/apikey). Add it to **backend/.env** with these settings:

```dotenv
GEMINI_API_KEY=your-own-key
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=1536
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER/
MONGODB_DATABASE=projectdocumentai
MONGODB_VECTOR_INDEX=projectdocumentai_vectors
```

Replace placeholders locally; do not commit or paste secrets into chat. Password characters in the Mongo URI must be URL-encoded. In Atlas, create a database user with access to this database and add your current public IP to the network access list.

Run:

```powershell
.\.venv\Scripts\python.exe scripts/setup_atlas.py
```

This creates the `chunks`, `document_content`, and `chat_turns` collections, regular indexes, and the Atlas vector index. The Atlas user needs permission to create a search index. Alternatively create a **Vector Search** index named `projectdocumentai_vectors` on `projectdocumentai.chunks` in the Atlas UI using [docs/atlas-vector-index.json](docs/atlas-vector-index.json).

Wait for the index to become **Ready**. Its definition needs the `embedding` vector field plus `project_id` and `embedding_model` filter fields. If you change embedding dimensions, update the index definition and reindex documents. Changing the embedding model also requires reindexing.

When switching from the previous AI provider, select **Index for AI** for every existing document. Old embeddings cannot be reused with Gemini; the retrieval filter excludes embeddings from other models. The default 1,536 dimensions keep the Atlas index definition unchanged. Reduced-dimensional Gemini vectors are normalized before storage and search.

Configuration indicators in Profile/Settings show that credentials are present; a successful indexing/chat request verifies connectivity.

### 4. Start the complete application

Install the frontend dependencies once on a fresh checkout:

```powershell
cd ..\frontend
npm.cmd install
cd ..
```

After setup, run one command from the project root:

```powershell
npm.cmd run dev
```

This starts FastAPI and React together in one terminal. Open **http://localhost:5173**. API: **http://127.0.0.1:8000**. Press Ctrl+C once to stop the entire application. Restart this command after editing `backend/.env`.

If 5173 is occupied, open the existing app first, or use `npm.cmd run dev -- --port 5174`. Use the same hostname consistently; localhost and 127.0.0.1 have separate browser cookies.

React, FastAPI, and PostgreSQL run locally. **Atlas and Gemini are external services** as required by the updated scope. Questions and relevant document/project content are sent to Gemini; Atlas stores extracted content, embeddings, and chat history. No cloud deployment is configured.

On macOS/Linux use `.venv/bin/python` and `npm` instead of the Windows setup commands; the same root `npm run dev` launcher starts both services.

## Try the complete workflow

1. Register, then drop in a PDF, DOCX, or TXT. The app creates and names the first project from the first file automatically. You can also choose **Create a project instead**.
2. Use the workspace document library to add more files.
3. Confirm that the document is **AI ready**. For older or failed documents, use the document's index/retry action.
4. In **Documents**, ask a question answered by the uploaded file.
5. Open a source card to inspect its excerpt and PDF page or document chunk.
6. Select **Summarise** and choose a document.
7. Create a task, then use **Tasks and project**: "Which high priority tasks are overdue?"
8. Use **Everything**: "Give me a project progress report and search the documents for risks."
9. Reload the page to check saved history.

Atlas indexing can be eventually consistent; wait briefly after indexing before searching a new file.

## AI design and limits

- LangChain splits page-aware text into overlapping 1,200-character chunks. Gemini embeds the chunks; Atlas stores and retrieves them.
- Retrieval includes server-generated project/model filters and verifies each document ID and index generation against PostgreSQL. Deleted/stale chunks cannot become retrieved sources.
- Source cards are constructed from retrieved metadata, not model-invented filenames. Unsupported source IDs are rejected. Model answers can still be incorrect; inspect their evidence.
- Natural-language database queries compile typed filters into parameterized SQLAlchemy queries for the authorized project. Supported filters: task status, priority, title, due date, overdue. Results include total count and at most 100 task rows.
- LangGraph orchestrates the agent's four read tools: document search, task lookup, project overview, and document summary. The graph can use up to four rounds with at most four calls per round. It does not create/delete records through chat.
- One conversation per user/project. History loads the latest 100 completed turns; the model sees the latest six messages. Clear conversation deletes that user's saved history for the selected project.
- File limit: 50 MB. Extracted-text limit: 1,000,000 characters. Summary limit: 100,000 characters. No OCR; scanned PDFs without selectable text are marked empty.
- Extraction, indexing, and AI calls are synchronous in this first version. Retry indexing after provider failures. Old extracted text is retained in PostgreSQL for local previews as well as copied to Atlas on indexing.
- Deleting documents/projects also cleans their Atlas content when an Atlas connection is configured or indexed content requires cleanup. Atlas must be reachable for that cleanup; deletion reports an error if it cannot complete. Deleting a document retains past chat text and cited excerpts until the conversation is cleared. Deleting a project also deletes its chat history for all users.
- The selected-project preference is browser-local. Chat messages are server-persisted.
- Profiles support display-name and password updates; account email is read-only.

## REST API

Application data routes require a session. Registration, login, health, and `/api/openapi.json` are accessible without a session; logout also accepts requests without a session so it can safely clear an expired cookie. Mutating API requests, including registration, login, and logout, require the `X-ProjectDocumentAI-Request: 1` header.

| Route | Methods |
|---|---|
| /api/auth/register, /api/auth/login, /api/auth/logout | POST |
| /api/auth/me | GET, PUT |
| /api/auth/password | PUT |
| /api/projects | GET, POST |
| /api/projects/{id} | GET, PUT, DELETE |
| /api/tasks | GET, POST |
| /api/tasks/{id} | PUT, DELETE |
| /api/documents | GET |
| /api/documents/projects/{id} | POST multipart upload |
| /api/documents/{id}/file | GET |
| /api/documents/{id} | DELETE |
| /api/documents/{id}/index | POST |
| /api/ai/status | GET |
| /api/ai/projects/{id}/messages | GET, POST, DELETE |
| /api/health | GET |

Chat POST accepts `message`, a UUID `requestId`, `mode` (documents/summary/data/agent), and optional `documentId` for summaries. Request IDs prevent duplicate completed replies. OpenAPI JSON: `/api/openapi.json`.

## Verification

From frontend/:

```powershell
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

To use an installed Edge browser instead: set `$env:PLAYWRIGHT_CHANNEL='msedge'` before running browser tests.

From backend/:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Tests use isolated PostgreSQL schemas and mock AI providers; they do not send your documents or keys to external services. If Windows denies the shared pytest temp directory, use a new `--basetemp .local/pytest-run-NAME` path and `-p no:cacheprovider`.

## Integration references

- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [LangChain ChatGoogleGenerativeAI](https://docs.langchain.com/oss/python/integrations/chat/google_generative_ai)
- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
- [LangChain MongoDB Atlas Vector Search](https://docs.langchain.com/oss/python/integrations/vectorstores/mongodb_atlas)
