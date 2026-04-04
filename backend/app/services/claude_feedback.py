import logging

import anthropic

from app.config import settings
from app.models.schemas import FeedbackRequest, FeedbackResponse

logger = logging.getLogger(__name__)


class ClaudeFeedbackService:
    """Uses Claude API to generate actionable feedback for low-engagement video sections."""

    def __init__(self):
        self._client = None

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return self._client

    async def get_feedback(self, request: FeedbackRequest) -> FeedbackResponse:
        """Generate feedback for a low-engagement section using Claude."""
        import asyncio

        prompt = self._build_prompt(request)

        response = await asyncio.to_thread(
            self.client.messages.create,
            model=settings.claude_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
            system=(
                "You are a video content engagement expert. You analyze sections of video content "
                "that show low brain engagement (measured via neural encoding models) and provide "
                "specific, actionable feedback to improve viewer engagement. Focus on content quality "
                "and delivery rather than production style. Be concise and practical."
            ),
        )

        return self._parse_response(request, response)

    def _build_prompt(self, request: FeedbackRequest) -> str:
        time_range = f"{request.section_start:.1f}s - {request.section_end:.1f}s"
        duration = request.section_end - request.section_start

        parts = [
            f"A video section ({time_range}, {duration:.1f}s duration) shows low brain engagement.",
            f"The weakest modality is: {request.modality}",
            f"Engagement score: {request.score:.2f} (0-1 scale, lower = less engaging)",
        ]

        if request.transcript:
            parts.append(f"\nTranscript of this section:\n\"{request.transcript}\"")

        parts.append(
            "\nProvide:\n"
            "1. A brief analysis of why this section may have low engagement (2-3 sentences)\n"
            "2. 3-5 specific suggestions to improve engagement in this section\n"
            "\nFormat your suggestions as a numbered list. Focus on the content and speech "
            "patterns rather than visual production quality."
        )

        return "\n".join(parts)

    def _parse_response(
        self, request: FeedbackRequest, response: anthropic.types.Message
    ) -> FeedbackResponse:
        full_text = response.content[0].text

        # Split into analysis and suggestions
        lines = full_text.strip().split("\n")
        feedback_lines = []
        suggestions = []
        in_suggestions = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            # Detect numbered suggestions
            if any(stripped.startswith(f"{i}.") or stripped.startswith(f"{i})") for i in range(1, 10)):
                in_suggestions = True
                # Clean the number prefix
                suggestion = stripped.lstrip("0123456789.)- ").strip()
                if suggestion:
                    suggestions.append(suggestion)
            elif not in_suggestions:
                feedback_lines.append(stripped)

        feedback = " ".join(feedback_lines) if feedback_lines else full_text
        if not suggestions:
            suggestions = [full_text]

        return FeedbackResponse(
            section_start=request.section_start,
            section_end=request.section_end,
            feedback=feedback,
            suggestions=suggestions,
        )
