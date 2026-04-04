export interface TimelinePoint {
  time: number;
  visual: number;
  text: number;
  audio: number;
}

export interface BrainActivation {
  time: number;
  vertices: number[];
}

export interface BrainViewerConfig {
  mesh: string;
  vertex_count: number;
  left_hemisphere_vertex_count: number;
  predicted_available: boolean;
  true_available: boolean;
  supports_open_close: boolean;
  supports_inflation: boolean;
  signal_lag_seconds: number;
}

export interface LowEngagementSection {
  start_time: number;
  end_time: number;
  modality: string;
  score: number;
  transcript: string;
  screenshot_url?: string | null;
  screenshot_time?: number | null;
  video_duration?: number | null;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface AnalysisResult {
  video_id: string;
  duration: number;
  timeline: TimelinePoint[];
  brain_activations: BrainActivation[];
  brain_viewer?: BrainViewerConfig | null;
  low_engagement_sections: LowEngagementSection[];
  transcript_segments: TranscriptSegment[];
}

export interface FeedbackResponse {
  section_start: number;
  section_end: number;
  feedback: string;
  suggestions: string[];
}

export interface ActivationSnapshot {
  visual: number;
  audio: number;
  text: number;
}

export interface FeedbackActivationContext {
  sample_count: number;
  section_average: ActivationSnapshot;
  overall_average: ActivationSnapshot;
  section_minimum: ActivationSnapshot;
  section_maximum: ActivationSnapshot;
  section_start: ActivationSnapshot;
  section_end: ActivationSnapshot;
}

export interface FeedbackRequest {
  video_id: string;
  section_start: number;
  section_end: number;
  transcript: string;
  modality: string;
  score: number;
  screenshot_url?: string | null;
  screenshot_time?: number | null;
  video_duration?: number | null;
  activation_context?: FeedbackActivationContext | null;
}

export interface ProcessingStatus {
  status: string;
  progress: number;
  message: string;
}

export type AppState = "upload" | "processing" | "results";
