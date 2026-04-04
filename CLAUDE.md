# Brain Fresh

Video engagement analyzer using Meta's TRIBE v2 neural brain encoding model.

## Structure

- `backend/` — Python FastAPI (uv-managed), integrates TRIBE v2 + Claude API
- `frontend/` — React + Vite + TypeScript, Three.js brain model, Recharts timeline

## Running

```bash
# Backend (terminal 1)
cd backend && bash run.sh

# Frontend (terminal 2)
cd frontend && bash run.sh
```

Backend: http://localhost:8000 | Frontend: http://localhost:5173

## Backend requires

- `.env` file with `ANTHROPIC_API_KEY=...`
- TRIBE v2 model will auto-download from HuggingFace on first run (~requires GPU for reasonable speed)

## Key commands

- Frontend build: `cd frontend && npx vite build`
- Backend typecheck: `cd backend && .venv/bin/python -m mypy app/`
- Frontend typecheck: `cd frontend && npx tsc --noEmit`
