import base64
import logging
import mimetypes
from pathlib import Path

import anthropic
from openai import OpenAI

from app.config import settings
from app.models.schemas import FeedbackRequest, FeedbackResponse

logger = logging.getLogger(__name__)

_FEEDBACK_SYSTEM = (
    "You are a video content engagement expert. You analyze sections of video content "
    "that show low brain engagement (measured via neural encoding models) and provide "
    "specific, actionable feedback to improve viewer engagement. Focus on content quality "
    "and delivery rather than production style. Use the transcript, timing within the full "
    "video, and any attached screenshot together. Be concise and practical."
)


class ClaudeFeedbackService:
    """LLM-backed feedback for low-engagement sections, preferring Anthropic."""

    def __init__(self):
        self._anthropic_client = None

    @property
    def anthropic_client(self) -> anthropic.Anthropic:
        if self._anthropic_client is None:
            self._anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return self._anthropic_client

    async def get_feedback(self, request: FeedbackRequest) -> FeedbackResponse:
        prompt = self._build_prompt(request)
        screenshot_data_url = self._load_screenshot_data_url(request.screenshot_url)

        if settings.anthropic_api_key.strip():
            try:
                full_text = await self._feedback_anthropic(prompt, screenshot_data_url)
            except anthropic.APIError as exc:
                raise ValueError(self._format_provider_error("Anthropic", exc)) from exc
        elif settings.moonshot_api_key.strip():
            full_text = await self._feedback_moonshot(prompt, screenshot_data_url)
        else:
            raise ValueError(
                "Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY in backend/.env for feedback."
            )

        return self._parse_response(request, full_text)

    async def _feedback_moonshot(self, prompt: str, screenshot_data_url: str | None) -> str:
        import asyncio

        base_url = str(settings.moonshot_base_url).rstrip("/")
        if not base_url.endswith("/v1"):
            base_url = f"{base_url}/v1"

        def _call(image_url: str | None) -> str:
            client = OpenAI(
                api_key=settings.moonshot_api_key,
                base_url=base_url,
            )
            user_content: str | list[dict[str, object]] = prompt
            if image_url:
                user_content = [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ]
            out = client.chat.completions.create(
                model=settings.moonshot_model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": _FEEDBACK_SYSTEM},
                    {"role": "user", "content": user_content},
                ],
            )
            return (out.choices[0].message.content or "").strip()

        try:
            return await asyncio.to_thread(_call, screenshot_data_url)
        except Exception:
            if not screenshot_data_url:
                raise
            logger.exception(
                "Moonshot multimodal request failed for model %s; retrying without screenshot.",
                settings.moonshot_model,
            )
            return await asyncio.to_thread(_call, None)

    async def _feedback_anthropic(self, prompt: str, screenshot_data_url: str | None) -> str:
        import asyncio

        def _call(content: str | list[dict[str, object]]) -> str:
            out = self.anthropic_client.messages.create(
                model=settings.claude_model,
                max_tokens=1024,
                messages=[{"role": "user", "content": content}],
                system=_FEEDBACK_SYSTEM,
            )
            text_blocks = [
                block.text
                for block in out.content
                if getattr(block, "type", "") == "text" and getattr(block, "text", "")
            ]
            return "\n".join(text_blocks).strip()

        content = self._build_anthropic_content(prompt, screenshot_data_url)
        try:
            return await asyncio.to_thread(_call, content)
        except Exception:
            if not screenshot_data_url:
                raise
            logger.exception(
                "Anthropic multimodal request failed for model %s; retrying without screenshot.",
                settings.claude_model,
            )
            return await asyncio.to_thread(_call, prompt)

    def _build_prompt(self, request: FeedbackRequest) -> str:
        time_range = f"{request.section_start:.1f}s - {request.section_end:.1f}s"
        duration = request.section_end - request.section_start

        parts = [
            f"A video section ({time_range}, {duration:.1f}s duration) shows low brain engagement.",
            f"The weakest modality is: {request.modality}",
            f"Engagement score: {request.score:.2f} (0-1 scale, lower = less engaging)",
        ]

        if request.video_duration and request.video_duration > 0:
            start_pct = request.section_start / request.video_duration * 100
            end_pct = request.section_end / request.video_duration * 100
            midpoint_pct = ((request.section_start + request.section_end) / 2) / request.video_duration * 100
            parts.append(
                "This section occurs within the full video at "
                f"{start_pct:.1f}% - {end_pct:.1f}% of a {request.video_duration:.1f}s video "
                f"(midpoint {midpoint_pct:.1f}%)."
            )

        if request.transcript:
            parts.append(f"\nTranscript of this section:\n\"{request.transcript}\"")

        if request.screenshot_time is not None:
            parts.append(
                f"\nA representative screenshot from {request.screenshot_time:.1f}s is attached when available."
            )

        if request.activation_context:
            ctx = request.activation_context
            parts.append(
                "\nActivation summary for this low-engagement section (0-1 normalized):\n"
                f"- Samples in section: {ctx.sample_count}\n"
                f"- Section mean: {self._format_snapshot(ctx.section_average)}\n"
                f"- Whole-video mean: {self._format_snapshot(ctx.overall_average)}\n"
                f"- Section vs whole-video delta: "
                f"{self._format_delta(ctx.section_average.visual - ctx.overall_average.visual, 'visual')}, "
                f"{self._format_delta(ctx.section_average.audio - ctx.overall_average.audio, 'audio')}, "
                f"{self._format_delta(ctx.section_average.text - ctx.overall_average.text, 'text')}\n"
                f"- Section range: min {self._format_snapshot(ctx.section_minimum)} | "
                f"max {self._format_snapshot(ctx.section_maximum)}\n"
                f"- Start of section: {self._format_snapshot(ctx.section_start)}\n"
                f"- End of section: {self._format_snapshot(ctx.section_end)}"
            )

        parts.append(
            "\nProvide:\n"
            "1. A brief analysis of why this section may have low engagement (2-3 sentences)\n"
            "2. 3-5 specific suggestions to improve engagement in this section\n"
            "\nFormat your suggestions as a numbered list. Focus on the content and speech "
            "patterns, pacing, and framing rather than production polish. Use the timing "
            "context and activation stats to explain how this moment compares with the rest "
            "of the video."
        )

        return "\n".join(parts)

    def _load_screenshot_data_url(self, screenshot_url: str | None) -> str | None:
        if not screenshot_url:
            return None
        if screenshot_url.startswith("data:"):
            return screenshot_url

        if screenshot_url.startswith("/uploads/"):
            rel_path = screenshot_url.removeprefix("/uploads/")
            path = (settings.upload_dir / rel_path).resolve()
        else:
            path = Path(screenshot_url).expanduser().resolve()

        upload_root = settings.upload_dir.resolve()
        if upload_root != path and upload_root not in path.parents:
            logger.warning("Ignoring screenshot outside upload directory: %s", screenshot_url)
            return None
        if not path.is_file():
            logger.warning("Screenshot file not found for feedback: %s", path)
            return None

        mime_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"

    def _build_anthropic_content(
        self, prompt: str, screenshot_data_url: str | None
    ) -> str | list[dict[str, object]]:
        image_payload = self._parse_data_url(screenshot_data_url)
        if not image_payload:
            return prompt

        media_type, encoded = image_payload
        return [
            {"type": "text", "text": prompt},
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": encoded,
                },
            },
        ]

    def _parse_data_url(self, data_url: str | None) -> tuple[str, str] | None:
        if not data_url or not data_url.startswith("data:"):
            return None
        header, _, encoded = data_url.partition(",")
        if not encoded or ";base64" not in header:
            return None
        media_type = header.removeprefix("data:").split(";", 1)[0] or "image/jpeg"
        return media_type, encoded

    def _format_snapshot(self, snapshot) -> str:
        return (
            f"visual {snapshot.visual:.2f}, "
            f"audio {snapshot.audio:.2f}, "
            f"text {snapshot.text:.2f}"
        )

    def _format_delta(self, value: float, label: str) -> str:
        sign = "+" if value >= 0 else ""
        return f"{label} {sign}{value:.2f}"

    def _format_provider_error(self, provider: str, exc: Exception) -> str:
        body = getattr(exc, "body", None)
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, dict):
                message = err.get("message")
                if isinstance(message, str) and message.strip():
                    return f"{provider} API error: {message.strip()}"
        return f"{provider} API error: {exc}"

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
