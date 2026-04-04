# Repository Guidelines

## Project Structure & Module Organization
This repository is split into two apps. `frontend/` contains the React 19 + Vite client: `src/components/` for UI and 3D brain views, `src/hooks/` for player sync, `src/services/api.ts` for backend calls, `src/types/` for shared TS shapes, and `src/utils/` for local helpers. Static assets live in `frontend/public/`, including `brain-mesh.json` and `brain-modality-map.json`. `backend/` contains the FastAPI service: `app/routes/` for endpoints, `app/services/` for TRIBE/feedback logic, `app/models/` for schemas, and `scripts/` for export utilities. Use `notebooks/` for experiments only. Treat `backend/uploads/` and `backend/model_cache/` as runtime data, not source.

## Build, Test, and Development Commands
- `cd backend && bash run.sh` boots `.venv` if needed and starts FastAPI on `http://localhost:8000`.
- `cd backend && uv venv && uv pip install -e .[dev]` installs backend dev dependencies.
- `cd backend && .venv/bin/ruff check app scripts` runs Python linting.
- `cd backend && .venv/bin/pytest` runs backend tests when present.
- `cd frontend && bash run.sh` installs npm packages if needed and starts Vite on `http://localhost:5173`.
- `cd frontend && npm run build` runs TypeScript checks and creates the production bundle.
- `cd frontend && npm run preview` serves the built frontend locally.

## Coding Style & Naming Conventions
Use 4-space indentation in Python, `snake_case` for modules/functions, and `PascalCase` for classes and Pydantic models. Ruff enforces a 100-character line length in the backend. In TypeScript, keep functional React components in `PascalCase` files like `BrainModel.tsx`, and use `camelCase` for hooks and utilities such as `useVideoSync`. `frontend/tsconfig.json` is strict; preserve explicit types at API boundaries.

## Testing Guidelines
No first-party test suite is committed yet. For backend changes, add `pytest` tests under `backend/tests/` using `test_<feature>.py`. For frontend work, `npm run build` is the minimum check; also manually verify upload, progress updates, and results rendering against the local backend.

## Commit & Pull Request Guidelines
Recent commits use short subjects such as `voxels`, `interface complete`, and `fixed progress bar`. Prefer concise, focused commit messages and keep each commit scoped to one change. PRs should summarize behavior changes, mention any `.env` or model-setting updates, link related issues, and include screenshots or recordings for UI changes.

## Security & Configuration Tips
Create `backend/.env` from `backend/.env.example` and keep API keys out of git. Do not commit uploaded videos, cached model files, or other generated analysis artifacts.
