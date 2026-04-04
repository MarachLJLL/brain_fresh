# Brain Fresh

Brain Fresh is a full-stack video engagement analyzer built around Meta's TRIBE v2 neural brain encoding model. You upload a video, the backend runs TRIBE-based cortical response inference, and the frontend renders the result as an interactive experience with:

- a synchronized video player
- an engagement timeline across visual, audio, and text modalities
- a cortical brain view
- transcript segments
- low-engagement section detection
- LLM-generated feedback for weak moments

## What It Does

At a high level, the app answers:

- Which parts of a video are likely to be less engaging?
- Which modality is weakest in those sections: visual, audio, or text?
- What does the model's cortical activity look like over time?
- What concrete changes could improve the low-engagement moments?

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- Axios
- Recharts
- Three.js
- `@react-three/fiber`
- `@react-three/drei`
- `lucide-react`

### Backend

- Python 3.10+
- FastAPI
- Uvicorn
- Pydantic / `pydantic-settings`
- NumPy
- TRIBE v2 from `facebookresearch/tribev2`
- Nilearn / SciPy for cortical surface export utilities
- Anthropic SDK
- OpenAI SDK used against Moonshot/Kimi's OpenAI-compatible API

### Model / AI Dependencies

- Meta TRIBE v2 for cortical response prediction
- Moonshot/Kimi or Anthropic Claude for feedback generation

## Architecture

```text
Frontend (React + Vite)
  |
  |-- upload video
  |-- open processing websocket
  |-- fetch final analysis JSON
  |-- request feedback for low-engagement sections
  v
Backend (FastAPI)
  |
  |-- /api/video/upload
  |-- /api/video/ws/process/{video_id}
  |-- /api/video/result/{video_id}
  |-- /api/feedback/analyze
  v
Services
  |
  |-- TribeProcessor
  |     |-- load TRIBE models
  |     |-- build events dataframe
  |     |-- run full / video-only / audio-only / text-only predictions
  |     |-- produce timeline, brain activations, transcript, low sections
  |
  |-- ClaudeFeedbackService
        |-- build prompt from section context
        |-- call Moonshot/Kimi or Anthropic
        |-- parse concise suggestions
```

## Project Structure

```text
brain_fresh/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entrypoint
│   │   ├── config.py               # environment-backed settings
│   │   ├── models/schemas.py       # shared API/data contracts
│   │   ├── routes/video.py         # upload, processing, result, streaming
│   │   ├── routes/feedback.py      # low-engagement feedback endpoint
│   │   ├── services/tribe_processor.py
│   │   └── services/claude_feedback.py
│   ├── scripts/export_brain_surfaces.py
│   ├── run.sh
│   ├── pyproject.toml
│   └── .env.example
├── frontend/
│   ├── public/brain-mesh.json      # current cortical mesh asset
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/useVideoSync.ts
│   │   ├── services/api.ts
│   │   ├── types/index.ts
│   │   └── utils/mockAnalysis.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── run.sh
├── notebooks/
│   └── colab_brain_fresh_export.ipynb
├── CLAUDE.md
└── README.md
```

## Runtime Flow

### 1. Video upload

The frontend posts the video to `POST /api/video/upload`.

The backend:

- creates a short `video_id`
- stores the uploaded file in `backend/uploads/`
- returns the upload metadata

### 2. Processing

The frontend opens `WS /api/video/ws/process/{video_id}`.

The backend:

- loads TRIBE models lazily
- extracts multimodal features/events from the video
- runs:
  - full model
  - video-only model
  - audio-only model
  - text-only model
- pushes progress updates back over the websocket

### 3. Analysis result

The backend builds an `AnalysisResult` containing:

- `timeline`: normalized visual/audio/text activity over time
- `brain_activations`: per-timestep cortical vertex activity
- `brain_viewer`: viewer metadata
- `low_engagement_sections`
- `transcript_segments`

The frontend then fetches `GET /api/video/result/{video_id}` and renders the results view.

### 4. Feedback

When a low-engagement section is selected, the frontend posts `POST /api/feedback/analyze`.

The backend enriches the request with stored section context when available, then calls:

- Moonshot/Kimi if `MOONSHOT_API_KEY` is set
- otherwise Anthropic Claude if `ANTHROPIC_API_KEY` is set

## Frontend Architecture

The frontend is intentionally small and component-driven.

### Main screen

`frontend/src/App.tsx`

Coordinates:

- upload state
- processing state
- results state
- selected section state
- demo mode
- playback synchronization

### Key components

- `VideoUpload.tsx`: file selection and upload entry
- `LoadingScreen.tsx`: processing progress UI and optional JSON import path
- `VideoPlayer.tsx`: synchronized video playback
- `Timeline.tsx`: chart for visual/audio/text engagement
- `BrainModel.tsx`: cortical mesh viewer with open/close and normal/inflated controls
- `TranscriptPanel.tsx`: transcript windows synchronized with playback
- `FeedbackPanel.tsx`: LLM-generated suggestions for low-engagement windows

### Shared frontend services

- `services/api.ts`: HTTP + websocket API wrapper
- `hooks/useVideoSync.ts`: current playback time / play-pause / seek synchronization
- `types/index.ts`: shared TypeScript interfaces
- `utils/mockAnalysis.ts`: demo-mode mock analysis without the backend

## Backend Architecture

### FastAPI app

`backend/app/main.py`

Responsibilities:

- applies Torch compatibility patches
- configures CORS
- mounts routers
- serves uploaded videos
- exposes `/api/health`

### Video routes

`backend/app/routes/video.py`

Responsibilities:

- file upload
- websocket-driven processing
- in-memory result storage
- analysis import
- result retrieval
- uploaded video streaming

Important note:

- analysis results are currently stored in memory only
- restarting the backend clears `analysis_store`

### TRIBE processing

`backend/app/services/tribe_processor.py`

Responsibilities:

- select inference device (`cuda`, `mps`, or `cpu`)
- load TRIBE v2 models
- generate event dataframe from input video
- run modality ablations
- aggregate outputs into timeline scores
- downsample cortical activations for frontend transport
- extract transcript segments
- detect low-engagement windows

### Feedback service

`backend/app/services/claude_feedback.py`

Responsibilities:

- build a structured prompt from timing/transcript/screenshot/context
- call Moonshot/Kimi or Anthropic
- parse the returned analysis and suggestions

## API Overview

### Health

- `GET /api/health`

Returns a basic status payload.

### Video upload

- `POST /api/video/upload`

Accepts multipart form data with a `file`.

### Processing websocket

- `WS /api/video/ws/process/{video_id}`

Streams progress states such as:

- `uploading`
- `extracting_features`
- `predicting`
- `analyzing`
- `complete`
- `error`

### Analysis result

- `GET /api/video/result/{video_id}`

Returns the final `AnalysisResult`.

### Stream uploaded video

- `GET /api/video/stream/{video_id}`

Used by the frontend video player.

### Import precomputed analysis

- `POST /api/video/import-result/{video_id}`

Disabled by default. Enable with `ALLOW_ANALYSIS_IMPORT=1`.

Useful when:

- processing in Colab or on a stronger machine
- loading a previously exported analysis JSON

### Feedback generation

- `POST /api/feedback/analyze`

Generates a concise explanation plus concrete suggestions for a weak section.

## Environment Configuration

Copy the example file before running the backend:

```bash
cd backend
cp .env.example .env
```

Key variables:

- `TRIBE_DEVICE=auto`
  - picks `cuda` when available
  - otherwise Apple `mps` on supported Macs
  - otherwise `cpu`
- `ALLOW_ANALYSIS_IMPORT=0`
  - set to `1` to allow `POST /api/video/import-result/{video_id}`
- `MOONSHOT_API_KEY=...`
  - enables feedback through Moonshot/Kimi
- `MOONSHOT_MODEL=kimi-k2.5`
- `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1`
- `ANTHROPIC_API_KEY=...`
  - fallback feedback provider if Moonshot is not configured
- `CLAUDE_MODEL=claude-sonnet-4-20250514`

You need at least one of:

- `MOONSHOT_API_KEY`
- `ANTHROPIC_API_KEY`

if you want the feedback panel to work.

## Prerequisites

Recommended local setup:

- Python 3.10+
- Node.js 20+
- npm
- `uv`

Notes:

- on macOS, CUDA is not available
- Apple Silicon can use `mps`
- first TRIBE model download can be large and slow
- CPU-only inference may be very slow

## How To Run

### 1. Start the backend

```bash
cd backend
bash run.sh
```

What `backend/run.sh` does:

- creates `.venv` with `uv` if it does not already exist
- installs backend dependencies
- starts Uvicorn on port `8000`

Backend URL:

- `http://localhost:8000`

### 2. Start the frontend

```bash
cd frontend
bash run.sh
```

What `frontend/run.sh` does:

- installs `node_modules` if needed
- starts Vite

Frontend URL:

- usually `http://localhost:5173`
- if `5173` is busy, Vite will choose another port

### 3. Use the app

Open the frontend in your browser and either:

- upload a real video and process it through the backend
- use demo mode to load a local video into the mock analysis path

## Development Commands

### Frontend

```bash
cd frontend
npm run build
```

### Backend

There is no root Makefile right now. Useful direct commands:

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Optional compile sanity check:

```bash
cd /path/to/brain_fresh
backend/.venv/bin/python -m compileall backend/app
```

## Optional Workflows

### Import precomputed analysis from Colab / GPU environment

Useful when local TRIBE inference is too slow.

Relevant files:

- `notebooks/colab_brain_fresh_export.ipynb`
- `backend/analysis_export.json`
- `backend/analysis_processed*.json`

The intended workflow is:

1. run TRIBE elsewhere
2. export the analysis JSON
3. enable `ALLOW_ANALYSIS_IMPORT=1`
4. load the result back into the backend through the import endpoint

### Export cortical surface assets

The frontend currently ships with `frontend/public/brain-mesh.json`.

There is also a utility to export fsaverage cortical assets:

```bash
cd backend
.venv/bin/python scripts/export_brain_surfaces.py
```

This writes:

- `frontend/public/brain-surfaces.json`

and is intended for a more TRIBE-style pial/inflated cortical viewer.

## Current Limitations

- analysis results are stored in memory, not in a database
- uploads persist on disk under `backend/uploads`, but metadata does not
- the current frontend brain viewer is a lightweight browser renderer, not the original Meta demo implementation
- `True` brain mode is not available for arbitrary uploads because there is no measured fMRI ground truth for user videos
- local TRIBE inference can be expensive without a capable GPU or Apple Silicon `mps`

## Troubleshooting

### Backend starts but processing is very slow

- check `TRIBE_DEVICE`
- on Apple Silicon, keep `TRIBE_DEVICE=auto`
- CPU-only inference is expected to be slow

### Feedback panel fails

Make sure one of these is configured in `backend/.env`:

- `MOONSHOT_API_KEY`
- `ANTHROPIC_API_KEY`

### Frontend cannot reach the backend

Make sure:

- backend is running on `localhost:8000`
- frontend is running through Vite
- Vite proxy is active for `/api`

### Analysis disappears after backend restart

This is expected with the current in-memory `analysis_store`.

## Key Files

- [backend/app/main.py](backend/app/main.py)
- [backend/app/routes/video.py](backend/app/routes/video.py)
- [backend/app/services/tribe_processor.py](backend/app/services/tribe_processor.py)
- [backend/app/services/claude_feedback.py](backend/app/services/claude_feedback.py)
- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/components/BrainModel.tsx](frontend/src/components/BrainModel.tsx)
- [frontend/src/services/api.ts](frontend/src/services/api.ts)
