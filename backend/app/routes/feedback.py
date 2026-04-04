import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import FeedbackRequest, FeedbackResponse
from app.services.claude_feedback import ClaudeFeedbackService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])

feedback_service = ClaudeFeedbackService()


@router.post("/analyze", response_model=FeedbackResponse)
async def analyze_section(request: FeedbackRequest):
    """Get LLM feedback for a low-engagement section (Kimi/Moonshot or Claude)."""
    try:
        return await feedback_service.get_feedback(request)
    except Exception as e:
        logger.exception("Error generating feedback")
        raise HTTPException(status_code=500, detail=f"Failed to generate feedback: {e}")
