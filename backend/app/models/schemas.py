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


class BrainViewerConfig(BaseModel):
    mesh: str = "fsaverage5"
    vertex_count: int
    left_hemisphere_vertex_count: int
    predicted_available: bool = True
    true_available: bool = False
    supports_open_close: bool = True
    supports_inflation: bool = True
    signal_lag_seconds: float = 5.0


class LowEngagementSection(BaseModel):
    start_time: float
    end_time: float
    modality: str  # which modality is low
    score: float
    transcript: str = ""
    screenshot_url: str | None = None
    screenshot_time: float | None = None
    video_duration: float | None = None


class ActivationSnapshot(BaseModel):
    visual: float
    audio: float
    text: float


class FeedbackActivationContext(BaseModel):
    sample_count: int
    section_average: ActivationSnapshot
    overall_average: ActivationSnapshot
    section_minimum: ActivationSnapshot
    section_maximum: ActivationSnapshot
    section_start: ActivationSnapshot
    section_end: ActivationSnapshot


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
    activation_context: FeedbackActivationContext | None = None


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
    brain_viewer: BrainViewerConfig | None = None
    low_engagement_sections: list[LowEngagementSection]
    transcript_segments: list[dict]  # [{start, end, text}]
