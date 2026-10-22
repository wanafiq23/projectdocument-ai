# ProjectDocumentAI frontend

The React + TypeScript application lives entirely in this folder. It has its own Node dependencies, Vite configuration, build output, and browser tests.

Start the complete application with one command from the repository root:

```powershell
npm.cmd run dev
```

Open **http://localhost:5173**. The root launcher starts React and FastAPI together and stops both when you press Ctrl+C.

For frontend-only debugging, run these commands from this folder while an API is already available on **127.0.0.1:8000**:

```powershell
npm.cmd run dev
npm.cmd run build        # Type-check and build into frontend/dist/
npm.cmd run preview      # Preview on localhost:4173
```

To run browser tests, initialize the sibling `../backend/` virtual environment and database first. The tests launch their own API and frontend using isolated PostgreSQL test data:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Or use installed Chrome with `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before running the tests.

Use `npm` and `npx` on macOS/Linux. Full setup and feature details are in the [project README](../README.md).


The app has one main page: Project Workspace. Login/Register is the signed-out entry state, and Profile/Settings opens as a modal. Project controls and document management share the left library, the assistant stays in the main area, and Tasks opens in a focused drawer. Legacy standalone URLs redirect into this consolidated structure.

AI Assistant calls the FastAPI backend; no Gemini or Atlas credentials belong in frontend environment variables. See [the root README](../README.md) for backend AI setup. The UI displays configuration and provider errors instead of simulated replies.
