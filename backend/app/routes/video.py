import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, WebSocket, WebSocketDisconnect

from app.config import settings
from app.models.schemas import AnalysisResult, UploadResponse
from app.services.tribe_processor import TribeProcessor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/video", tags=["video"])

# In-memory store for analysis results (use Redis/DB in production)
analysis_store: dict[str, AnalysisResult] = {}


@router.post("/upload", response_model=UploadResponse)
async def upload_video(file: UploadFile):
    """Upload a video file for analysis."""
    video_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename).suffix if file.filename else ".mp4"
    save_path = settings.upload_dir / f"{video_id}{ext}"

    with open(save_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            f.write(chunk)

    return UploadResponse(video_id=video_id, filename=file.filename or "unknown")


@router.websocket("/ws/process/{video_id}")
async def process_video_ws(websocket: WebSocket, video_id: str):
    """WebSocket endpoint for real-time processing updates."""
    await websocket.accept()

    try:
        # Find the uploaded video file
        video_path = _find_video(video_id)
        if not video_path:
            await websocket.send_json(
                {"status": "error", "progress": 0, "message": "Video not found"}
            )
            await websocket.close()
            return

        async def progress_callback(status: str, progress: float, message: str):
            await websocket.send_json(
                {"status": status, "progress": progress, "message": message}
            )

        processor = TribeProcessor.get_instance()
        result = await processor.process_video(str(video_path), progress_callback)

        # Store the result
        analysis_store[video_id] = result

        await websocket.send_json(
            {"status": "complete", "progress": 100, "message": "Analysis complete!"}
        )

    except WebSocketDisconnect:
        logger.info(f"Client disconnected during processing of {video_id}")
    except Exception as e:
        logger.exception(f"Error processing video {video_id}")
        try:
            await websocket.send_json(
                {"status": "error", "progress": 0, "message": str(e)}
            )
        except Exception:
            pass


@router.get("/result/{video_id}", response_model=AnalysisResult)
async def get_result(video_id: str):
    """Get the analysis result for a processed video."""
    if video_id not in analysis_store:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Analysis not found. Process the video first.")
    return analysis_store[video_id]


@router.get("/stream/{video_id}")
async def stream_video(video_id: str):
    """Serve the uploaded video file for playback."""
    from fastapi.responses import FileResponse

    video_path = _find_video(video_id)
    if not video_path:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(video_path), media_type="video/mp4")


def _find_video(video_id: str) -> Path | None:
    """Find the uploaded video file by ID."""
    for ext in [".mp4", ".avi", ".mkv", ".mov", ".webm"]:
        path = settings.upload_dir / f"{video_id}{ext}"
        if path.exists():
            return path
    return None
