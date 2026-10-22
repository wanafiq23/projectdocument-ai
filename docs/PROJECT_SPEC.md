# ProjectDocumentAI - current specification

This specification supersedes the original multi-page, localhost-only, pgvector plan.

## Product
A project management and document intelligence platform. React and TypeScript frontend, FastAPI and Python backend, PostgreSQL structured data, MongoDB Atlas Vector Search embeddings/retrieval, LangChain integrations, LangGraph agent orchestration, and Gemini language and embedding models.

## One main page
1. Project Workspace - focused two-column document assistant with project creation/switching, upload/library, and compact project tools on the left, plus the AI conversation and explained AI-mode controls on the right

Login/Register is the signed-out entry state, and Profile/Settings opens as a modal rather than another page. Users create, switch, edit, and delete projects without leaving the workspace. The assistant stays in the main area, task management opens in a query-controlled drawer, and document upload, preview, indexing, and deletion live in the left library. The integrated assistant retains selected-project context, saved history, citations, summaries, database questions, and LangGraph agent tools. Legacy routes redirect into the one-page interface, and the document library becomes a drawer on mobile.

## Data ownership
- PostgreSQL: users, sessions, projects, memberships, roles, permissions, tasks, document metadata, extraction cache, indexing status.
- Local upload directory: original files.
- MongoDB Atlas: document content/pages, vector chunks, embeddings, project/user-scoped chat turns and AI metadata.
- Gemini: document embeddings and language responses, integrated through LangChain; LangGraph orchestrates the bounded agent workflow.
- No pgvector or Docker is required.

## Core features
- Register/login/logout, edit name, change password.
- Create/edit/delete projects and tasks. Tasks have title, description, priority, due date, assignee, To Do / In Progress / Done.
- PDF/DOCX/UTF-8 TXT upload, extraction, preview/download, deletion, AI indexing/retrieval and retry.
- Document RAG answers include file name and real PDF page or chunk locations.
- Document summaries, natural-language task queries, bounded agent tool calling, persisted chat history.
- Query tools and retrieval are limited to the authorized selected project. Agent tools initially provide reads and summaries. Task/project mutations use explicit forms.

## Runtime
Frontend and API bind to loopback. PostgreSQL remains local. Atlas and Gemini are external services, intentionally replacing the earlier entirely local requirement. Secrets exist only in backend/.env. No cloud deployment is configured.

## First-version limits
Synchronous extraction/indexing, no OCR, 50 MB files, 1,000,000 extracted characters. Summaries accept up to 100,000 characters. One conversation per user/project; history view loads the latest 100 completed turns, with the latest six messages used as model context. Database questions support project statistics and bounded task filters; there is no arbitrary generated SQL. Agent tools are read-only and limited to four rounds with four calls per round.
