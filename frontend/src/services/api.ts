import axios from "axios";
import type {
  AnalysisResult,
  FeedbackResponse,
  ProcessingStatus,
} from "../types";

const api = axios.create({ baseURL: "/api" });

export async function uploadVideo(file: File): Promise<{ video_id: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/video/upload", form);
  return data;
}

export function connectProcessingWs(
  videoId: string,
  onStatus: (status: ProcessingStatus) => void,
  onComplete: () => void,
  onError: (err: string) => void
): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(
    `${protocol}//${window.location.host}/api/video/ws/process/${videoId}`
  );

  ws.onmessage = (event) => {
    const data: ProcessingStatus = JSON.parse(event.data);
    onStatus(data);
    if (data.status === "complete") onComplete();
    if (data.status === "error") onError(data.message);
  };

  ws.onerror = () => onError("WebSocket connection failed");
  return ws;
}

export async function getAnalysisResult(
  videoId: string
): Promise<AnalysisResult> {
  const { data } = await api.get(`/video/result/${videoId}`);
  return data;
}

export async function getFeedback(params: {
  video_id: string;
  section_start: number;
  section_end: number;
  transcript: string;
  modality: string;
  score: number;
}): Promise<FeedbackResponse> {
  const { data } = await api.post("/feedback/analyze", params);
  return data;
}

export function getVideoUrl(videoId: string): string {
  return `/api/video/stream/${videoId}`;
}
