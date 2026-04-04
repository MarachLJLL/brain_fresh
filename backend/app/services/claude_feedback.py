import logging

import anthropic
from openai import OpenAI

from app.config import settings
from app.models.schemas import FeedbackRequest, FeedbackResponse

logger = logging.getLogger(__name__)

_FEEDBACK_SYSTEM = (
    "You are a video content engagement expert. You analyze sections of video content "
    "that show low brain engagement (measured via neural encoding models) and provide "
    "specific, actionable feedback to improve viewer engagement. Focus on content quality "
    "and delivery rather than production style. Be concise and practical."
)


class ClaudeFeedbackService:
    """LLM-backed feedback for low-engagement sections (Kimi/Moonshot or Claude)."""

    def __init__(self):
        self._anthropic_client = None

    @property
    def anthropic_client(self) -> anthropic.Anthropic:
        if self._anthropic_client is None:
            self._anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return self._anthropic_client

    async def get_feedback(self, request: FeedbackRequest) -> FeedbackResponse:
        import asyncio

        prompt = self._build_prompt(request)

        if settings.moonshot_api_key.strip():
            full_text = await self._feedback_moonshot(prompt)
        elif settings.anthropic_api_key.strip():
            response = await asyncio.to_thread(
                self.anthropic_client.messages.create,
                model=settings.claude_model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
                system=_FEEDBACK_SYSTEM,
            )
            full_text = response.content[0].text
        else:
            raise ValueError(
                "Set MOONSHOT_API_KEY (Kimi) or ANTHROPIC_API_KEY in backend/.env for feedback."
            )

        return self._parse_response(request, full_text)

    async def _feedback_moonshot(self, prompt: str) -> str:
        import asyncio

        base_url = str(settings.moonshot_base_url).rstrip("/")
        if not base_url.endswith("/v1"):
            base_url = f"{base_url}/v1"

        def _call() -> str:
            client = OpenAI(
                api_key=settings.moonshot_api_key,
                base_url=base_url,
            )
            out = client.chat.completions.create(
                model=settings.moonshot_model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": _FEEDBACK_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
            )
            return (out.choices[0].message.content or "").strip()

        return await asyncio.to_thread(_call)

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

    def _parse_response(self, request: FeedbackRequest, full_text: str) -> FeedbackResponse:
        lines = full_text.strip().split("\n")
        feedback_lines = []
        suggestions = []
        in_suggestions = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if any(stripped.startswith(f"{i}.") or stripped.startswith(f"{i})") for i in range(1, 10)):
                in_suggestions = True
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
