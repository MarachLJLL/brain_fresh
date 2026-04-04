# Repository Guidelines

## Project Structure & Module Organization
This repo is split by runtime, not by package. `frontend/` contains the React 19 + Vite UI: `src/components/` for panels and the 3D brain viewer, `src/hooks/` for playback sync, `src/services/api.ts` for HTTP/WebSocket calls, `src/types/` for shared TypeScript types, and `public/` for static mesh data such as `brain-mesh.json`. `backend/` contains the FastAPI service: `app/routes/` for API endpoints, `app/services/` for TRIBE and feedback integrations, `app/models/` for Pydantic schemas, and `scripts/` for export utilities. Use `notebooks/` for one-off analysis, not production code. Runtime files in `backend/uploads/` and `backend/model_cache/` should stay untracked.

## Build, Test, and Development Commands
Run commands from the relevant subdirectory; there is no top-level build wrapper.

- `cd backend && bash run.sh`: create `.venv` if needed and start FastAPI on `:8000`.
- `cd backend && uv venv && uv pip install -e .[dev]`: install backend app plus `ruff` and `pytest`.
- `cd backend && .venv/bin/ruff check app scripts`: lint Python code.
- `cd backend && .venv/bin/pytest`: run backend tests when present.
- `cd frontend && bash run.sh`: install npm dependencies if needed and start Vite on `:5173`.
- `cd frontend && npm run build`: run TypeScript compile checks and produce a production bundle.

## Coding Style & Naming Conventions
Python uses 4-space indentation, `snake_case` modules, and `PascalCase` schema/class names. Keep lines within Ruff's 100-character limit. TypeScript uses strict mode, functional React components, `PascalCase` component filenames, and `camelCase` hooks/utilities such as `useVideoSync` and `mockAnalysis`. No ESLint or Prettier config is committed, so match existing formatting and import style in touched files.

## Testing Guidelines
The repo currently ships no first-party tests. For backend logic, add `pytest` coverage under `backend/tests/` with `test_<feature>.py` naming. For frontend changes, `npm run build` is the minimum gate; also smoke-test upload, processing, and results flows against the local backend.

## Commit & Pull Request Guidelines
Recent history uses short, imperative subjects such as `fixed how brain displays`. Keep commits focused and subjects concise. PRs should summarize user-visible behavior, note any `.env` or model-setting changes, and include screenshots or short recordings for UI work in `frontend/src/`.

## Security & Configuration Tips
Copy `backend/.env.example` to `backend/.env` and keep API keys out of git. Do not commit uploaded videos, cached model artifacts, or generated local analysis data.
