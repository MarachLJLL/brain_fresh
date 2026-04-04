import asyncio
import logging
from pathlib import Path

import numpy as np

from app.config import settings
from app.models.schemas import (
    AnalysisResult,
    BrainActivation,
    LowEngagementSection,
    TimelinePoint,
)

logger = logging.getLogger(__name__)


def _tribe_inference_device() -> str:
    """Pick torch device for TRIBE. CUDA is unavailable on macOS; use MPS on Apple Silicon when possible."""
    import torch

    raw = (settings.tribe_device or "auto").strip().lower()
    if raw in ("cpu", "cuda", "mps"):
        return raw
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# Region masks for fsaverage5 (20484 vertices total, 10242 per hemisphere).
# These index ranges approximate the major functional regions based on the HCP parcellation.
# Visual cortex: V1-V4, MT complex (roughly posterior occipital vertices)
# Auditory cortex: A1, Belt, Parabelt (roughly superior temporal vertices)
# Language/Text: Broca's area, Wernicke's area, STS, angular gyrus

# Vertex index ranges for fsaverage5 surface (approximate functional groupings)
# These are derived from the HCP MMP1.0 parcellation mapped to fsaverage5
VISUAL_REGIONS = list(range(0, 2500)) + list(range(10242, 12742))  # early + ventral visual
AUDITORY_REGIONS = list(range(4500, 5500)) + list(range(14742, 15742))  # auditory cortex
LANGUAGE_REGIONS = list(range(5500, 7000)) + list(range(15742, 17242))  # language network


class TribeProcessor:
    """Wraps TRIBE v2 model for video analysis."""

    _instance = None
    _models_loaded = False

    def __init__(self):
        self._model_all = None
        self._model_video = None
        self._model_audio = None
        self._model_text = None

    @classmethod
    def get_instance(cls) -> "TribeProcessor":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def load_models(self, progress_callback=None):
        """Load TRIBE v2 model variants (full + per-modality ablations)."""
        if self._models_loaded:
            return

        def _load():
            from tribev2.demo_utils import TribeModel

            device = _tribe_inference_device()
            logger.info("TRIBE v2 inference device: %s", device)

            logger.info("Loading TRIBE v2 full model...")
            self._model_all = TribeModel.from_pretrained(
                checkpoint_dir=settings.tribe_model_id,
                cache_folder=settings.tribe_cache_dir,
                device=device,
            )

            logger.info("Loading TRIBE v2 video-only model...")
            self._model_video = TribeModel.from_pretrained(
                checkpoint_dir=settings.tribe_model_id,
                cache_folder=settings.tribe_cache_dir,
                device=device,
                config_update={"data.features_to_mask": ["text", "audio"]},
            )

            logger.info("Loading TRIBE v2 audio-only model...")
            self._model_audio = TribeModel.from_pretrained(
                checkpoint_dir=settings.tribe_model_id,
                cache_folder=settings.tribe_cache_dir,
                device=device,
                config_update={"data.features_to_mask": ["video", "text"]},
            )

            logger.info("Loading TRIBE v2 text-only model...")
            self._model_text = TribeModel.from_pretrained(
                checkpoint_dir=settings.tribe_model_id,
                cache_folder=settings.tribe_cache_dir,
                device=device,
                config_update={"data.features_to_mask": ["video", "audio"]},
            )

        await asyncio.to_thread(_load)
        self._models_loaded = True
        logger.info("All TRIBE v2 models loaded.")

    async def process_video(self, video_path: str, progress_callback=None) -> AnalysisResult:
        """Run full analysis pipeline on a video file."""
        if not self._models_loaded:
            await self.load_models(progress_callback)

        video_path = str(video_path)

        if progress_callback:
            await progress_callback("extracting_features", 10, "Extracting features from video...")

        # Build events dataframe (extracts audio, transcribes, builds context)
        events_df = await asyncio.to_thread(
            self._model_all.get_events_dataframe, video_path=video_path
        )

        if progress_callback:
            await progress_callback("predicting", 30, "Running brain predictions (all modalities)...")

        # Run predictions for each modality configuration
        preds_all, segments = await asyncio.to_thread(self._model_all.predict, events=events_df)
        if progress_callback:
            await progress_callback("predicting", 50, "Running video-only predictions...")
        preds_video, _ = await asyncio.to_thread(self._model_video.predict, events=events_df)

        if progress_callback:
            await progress_callback("predicting", 65, "Running audio-only predictions...")
        preds_audio, _ = await asyncio.to_thread(self._model_audio.predict, events=events_df)

        if progress_callback:
            await progress_callback("predicting", 80, "Running text-only predictions...")
        preds_text, _ = await asyncio.to_thread(self._model_text.predict, events=events_df)

        if progress_callback:
            await progress_callback("analyzing", 90, "Analyzing engagement patterns...")

        # Compute per-timestep scores for each modality
        n_timesteps = preds_all.shape[0]
        duration = float(n_timesteps)  # 1 Hz sampling rate = 1 second per timestep

        # Aggregate vertex activations into regional scores
        timeline = self._build_timeline(preds_video, preds_audio, preds_text, duration)

        # Downsample brain activations for 3D visualization
        brain_activations = self._build_brain_activations(preds_all, duration)

        # Extract transcript segments from events
        transcript_segments = self._extract_transcript(events_df)

        # Find low-engagement sections
        low_sections = self._find_low_engagement(timeline, transcript_segments)

        video_id = Path(video_path).stem

        if progress_callback:
            await progress_callback("complete", 100, "Analysis complete!")

        return AnalysisResult(
            video_id=video_id,
            duration=duration,
            timeline=timeline,
            brain_activations=brain_activations,
            low_engagement_sections=low_sections,
            transcript_segments=transcript_segments,
        )

    def _build_timeline(
        self,
        preds_video: np.ndarray,
        preds_audio: np.ndarray,
        preds_text: np.ndarray,
        duration: float,
    ) -> list[TimelinePoint]:
        """Convert per-vertex predictions to per-timestep modality scores."""
        n_timesteps = preds_video.shape[0]
        timeline = []

        for t in range(n_timesteps):
            # Mean absolute activation in relevant brain regions for each modality
            visual_score = float(np.mean(np.abs(preds_video[t, VISUAL_REGIONS])))
            audio_score = float(np.mean(np.abs(preds_audio[t, AUDITORY_REGIONS])))
            text_score = float(np.mean(np.abs(preds_text[t, LANGUAGE_REGIONS])))

            timeline.append(
                TimelinePoint(
                    time=float(t),
                    visual=visual_score,
                    text=text_score,
                    audio=audio_score,
                )
            )

        # Normalize each channel to 0-1 range
        if timeline:
            for key in ("visual", "text", "audio"):
                values = [getattr(p, key) for p in timeline]
                vmin, vmax = min(values), max(values)
                rng = vmax - vmin if vmax > vmin else 1.0
                for p in timeline:
                    setattr(p, key, (getattr(p, key) - vmin) / rng)

        return timeline

    def _build_brain_activations(
        self, preds_all: np.ndarray, duration: float
    ) -> list[BrainActivation]:
        """Downsample brain vertex data for transfer to frontend 3D visualization."""
        n_timesteps = preds_all.shape[0]
        activations = []

        # Downsample vertices: take every Nth vertex for manageable transfer size
        # fsaverage5 has 20484 vertices; downsample to ~1000 for the 3D model
        step = max(1, preds_all.shape[1] // 1000)

        for t in range(n_timesteps):
            vertex_data = preds_all[t, ::step]
            # Normalize to 99th percentile as per the paper
            p99 = np.percentile(np.abs(vertex_data), 99)
            if p99 > 0:
                vertex_data = vertex_data / p99
            vertex_data = np.clip(vertex_data, -1.0, 1.0)

            activations.append(
                BrainActivation(
                    time=float(t),
                    vertices=vertex_data.tolist(),
                )
            )

        return activations

    def _extract_transcript(self, events_df) -> list[dict]:
        """Pull transcript segments from the TRIBE events dataframe."""
        segments = []
        word_events = events_df[events_df["type"] == "Word"] if "type" in events_df.columns else None
        if word_events is None or word_events.empty:
            return segments

        # Group words into ~5-second windows for readable transcript segments
        current_segment = {"start": 0.0, "end": 0.0, "text": ""}
        window = 5.0

        for _, row in word_events.iterrows():
            start = float(row.get("start", 0))
            text = str(row.get("text", ""))

            if start - current_segment["start"] > window and current_segment["text"]:
                segments.append(current_segment.copy())
                current_segment = {"start": start, "end": start, "text": ""}

            current_segment["text"] += (" " + text) if current_segment["text"] else text
            current_segment["end"] = start + float(row.get("duration", 0.5))

        if current_segment["text"]:
            segments.append(current_segment)

        return segments

    def _find_low_engagement(
        self,
        timeline: list[TimelinePoint],
        transcript_segments: list[dict],
    ) -> list[LowEngagementSection]:
        """Identify sections where engagement drops below threshold."""
        if not timeline:
            return []

        threshold = settings.low_engagement_threshold
        low_sections = []

        # Calculate combined engagement score
        combined = [(p.visual + p.text + p.audio) / 3.0 for p in timeline]
        cutoff = np.percentile(combined, threshold * 100)

        # Find contiguous low-engagement windows (minimum 3 seconds)
        in_low = False
        start_t = 0.0

        for i, score in enumerate(combined):
            t = timeline[i].time
            if score <= cutoff and not in_low:
                in_low = True
                start_t = t
            elif (score > cutoff or i == len(combined) - 1) and in_low:
                end_t = t
                if end_t - start_t >= 3.0:
                    # Determine which modality is weakest
                    section_points = [
                        p for p in timeline if start_t <= p.time <= end_t
                    ]
                    avg_v = np.mean([p.visual for p in section_points])
                    avg_t = np.mean([p.text for p in section_points])
                    avg_a = np.mean([p.audio for p in section_points])
                    weakest = min(
                        [("visual", avg_v), ("text", avg_t), ("audio", avg_a)],
                        key=lambda x: x[1],
                    )

                    # Find transcript for this section
                    transcript = " ".join(
                        seg["text"]
                        for seg in transcript_segments
                        if seg["end"] >= start_t and seg["start"] <= end_t
                    )

                    low_sections.append(
                        LowEngagementSection(
                            start_time=start_t,
                            end_time=end_t,
                            modality=weakest[0],
                            score=float(np.mean([s for s in combined[int(start_t):int(end_t) + 1]])),
                            transcript=transcript,
                        )
                    )
                in_low = False

        return low_sections
