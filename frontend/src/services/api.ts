import axios from "axios";
import type {
  AnalysisResult,
  FeedbackRequest,
  FeedbackResponse,
  ProcessingStatus,
} from "../types";

const api = axios.create({ baseURL: "/api" });

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

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

/** When ALLOW_ANALYSIS_IMPORT=1 on the API; stores Colab-exported JSON for this upload id. */
export async function importAnalysisResult(
  videoId: string,
  result: AnalysisResult
): Promise<AnalysisResult> {
  const { data } = await api.post(`/video/import-result/${videoId}`, result);
  return data;
}

export async function getFeedback(params: FeedbackRequest): Promise<FeedbackResponse> {
  try {
    const { data } = await api.post("/feedback/analyze", params);
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, "Failed to get feedback"));
  }
}

export function getVideoUrl(videoId: string): string {
  return `/api/video/stream/${videoId}`;
}
