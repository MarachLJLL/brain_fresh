from pydantic import BaseModel


class UploadResponse(BaseModel):
    video_id: str
    filename: str
    duration: float | None = None


class ProcessingStatus(BaseModel):
    video_id: str
    status: str  # "uploading" | "extracting_features" | "predicting" | "analyzing" | "complete" | "error"
    progress: float  # 0-100
    message: str = ""


class TimelinePoint(BaseModel):
    time: float  # seconds
    visual: float
    text: float
    audio: float


class BrainActivation(BaseModel):
    time: float
    vertices: list[float]  # per-vertex activation values (downsampled for transfer)


class LowEngagementSection(BaseModel):
    start_time: float
    end_time: float
    modality: str  # which modality is low
    score: float
    transcript: str = ""
    screenshot_url: str | None = None
    screenshot_time: float | None = None
    video_duration: float | None = None


class FeedbackRequest(BaseModel):
    video_id: str
    section_start: float
    section_end: float
    transcript: str = ""
    modality: str = ""
    score: float = 0.0
    screenshot_url: str | None = None
    screenshot_time: float | None = None
    video_duration: float | None = None


class FeedbackResponse(BaseModel):
    section_start: float
    section_end: float
    feedback: str
    suggestions: list[str]


class AnalysisResult(BaseModel):
    video_id: str
    duration: float
    timeline: list[TimelinePoint]
    brain_activations: list[BrainActivation]
    low_engagement_sections: list[LowEngagementSection]
    transcript_segments: list[dict]  # [{start, end, text}]
