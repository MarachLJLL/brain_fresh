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
  low_engagement_sections: LowEngagementSection[];
  transcript_segments: TranscriptSegment[];
}

export interface FeedbackResponse {
  section_start: number;
  section_end: number;
  feedback: string;
  suggestions: string[];
}

export interface ProcessingStatus {
  status: string;
  progress: number;
  message: string;
}

export type AppState = "upload" | "processing" | "results";
