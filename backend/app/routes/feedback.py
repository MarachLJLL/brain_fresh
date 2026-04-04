import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import FeedbackRequest, FeedbackResponse
from app.routes.video import analysis_store
from app.services.claude_feedback import ClaudeFeedbackService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])

feedback_service = ClaudeFeedbackService()


@router.post("/analyze", response_model=FeedbackResponse)
async def analyze_section(request: FeedbackRequest):
    """Get LLM feedback for a low-engagement section (Kimi/Moonshot or Claude)."""
    try:
        return await feedback_service.get_feedback(_hydrate_request(request))
    except Exception as e:
        logger.exception("Error generating feedback")
        raise HTTPException(status_code=500, detail=f"Failed to generate feedback: {e}")


def _hydrate_request(request: FeedbackRequest) -> FeedbackRequest:
    analysis = analysis_store.get(request.video_id)
    if not analysis:
        return request

    matched = next(
        (
            section
            for section in analysis.low_engagement_sections
            if abs(section.start_time - request.section_start) < 0.51
            and abs(section.end_time - request.section_end) < 0.51
        ),
        None,
    )
    if not matched:
        if request.video_duration is None:
            return request.model_copy(update={"video_duration": analysis.duration})
        return request

    return request.model_copy(
        update={
            "transcript": request.transcript or matched.transcript,
            "modality": request.modality or matched.modality,
            "score": request.score if request.score > 0 else matched.score,
            "screenshot_url": request.screenshot_url or matched.screenshot_url,
            "screenshot_time": (
                request.screenshot_time
                if request.screenshot_time is not None
                else matched.screenshot_time
            ),
            "video_duration": request.video_duration or matched.video_duration or analysis.duration,
        }
    )
