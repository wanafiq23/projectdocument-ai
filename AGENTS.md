# AGENTS.md

## Project overview

ProjectDocumentAI is a full-stack project management and document-intelligence application.

- Frontend: React 19, TypeScript, Vite, and Playwright
- Backend: FastAPI, SQLAlchemy, Alembic, and pytest
- Data: PostgreSQL for application records and MongoDB Atlas for document vectors and chat history
- AI: Gemini through LangChain, with LangGraph for the bounded read-only agent workflow

Read `README.md` and `docs/PROJECT_SPEC.md` before making substantial product or architecture changes. The current product is a single signed-in Project Workspace; do not reintroduce legacy standalone pages.

## Documentation roles

- `AGENTS.md`: coding-agent rules for changes, verification, and data safety.
- `README.md`: application overview, architecture, setup, usage, and API reference.
- `docs/PROJECT_SPEC.md`: current product scope and first-version limits.

Keep these documents consistent with the implementation. Reference the README for detailed setup rather than duplicating it here.

## Repository layout

- `frontend/src/`: React application code
- `frontend/tests/`: Playwright end-to-end tests
- `backend/app/`: FastAPI application code
- `backend/app/routes/`: API route modules
- `backend/app/ai/`: AI, retrieval, indexing, and agent code
- `backend/migrations/`: additive Alembic migrations
- `backend/tests/`: backend tests
- `docs/PROJECT_SPEC.md`: current product scope

## Development commands

From the repository root on Windows:

```powershell
npm.cmd run dev
```

Frontend verification from `frontend/`:

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Browser tests need Playwright Chromium installed. To use an installed Microsoft Edge browser on Windows, set `$env:PLAYWRIGHT_CHANNEL='msedge'` first. See the README verification section for setup commands.

Backend verification from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Run the smallest relevant test first, then the broader suite when practical. On macOS or Linux, use `npm`/`npx` and `.venv/bin/python`.

## Coding expectations

- Preserve the existing architecture and naming conventions unless the task explicitly requires a redesign.
- Keep TypeScript types explicit at API and component boundaries.
- Keep FastAPI routes thin; put reusable AI and business logic in focused modules.
- Enforce authentication, project membership, and project scoping for all protected data access.
- Keep mutating API calls compatible with the required `X-ProjectDocumentAI-Request: 1` header.
- Use additive Alembic migrations for schema changes. Do not rewrite migrations that may already have been applied.
- Keep AI tools read-only unless the product specification is intentionally changed.
- Build citations from retrieved metadata; never allow the model to invent source filenames or IDs.
- Update tests and documentation when behavior, setup, API contracts, or architecture changes.

## Security and data safety

- Never commit, print, or paste secrets from `backend/.env`.
- Do not put Gemini or MongoDB credentials in frontend code or frontend environment variables.
- Do not weaken authentication, authorization, upload validation, or project isolation.
- Do not delete or overwrite the local database, uploads, Atlas content, or user configuration unless explicitly requested.
- Preserve the user's existing `.env` and local data during setup or dependency updates.

## Files not to edit manually

Treat these as generated or local artifacts unless a task explicitly targets them:

- `frontend/dist/`
- `frontend/tsconfig.tsbuildinfo`
- `**/__pycache__/`
- `.pytest_cache/`
- `backend/.venv/`
- `backend/.local/`
- dependency directories such as `node_modules/`

## Completion checklist

Before considering a change complete:

1. Verify the affected behavior with the most relevant tests or build command.
2. Check that secrets and local data were not exposed or replaced.
3. Confirm frontend and backend API types still agree when an endpoint changes.
4. Add an Alembic migration when the database schema changes.
5. Summarize changed files, verification performed, and any remaining limitations.
