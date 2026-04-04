import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Lightbulb,
  Loader,
  MessageSquare,
} from "lucide-react";
import type {
  ActivationSnapshot,
  FeedbackActivationContext,
  FeedbackRequest,
  FeedbackResponse,
  LowEngagementSection,
  TimelinePoint,
} from "../types";
import { getFeedback } from "../services/api";

interface Props {
  videoId: string;
  videoSrc: string;
  videoDuration: number;
  timeline: TimelinePoint[];
  section: LowEngagementSection | null;
  lowSections: LowEngagementSection[];
  onSelectSection: (section: LowEngagementSection) => void;
  onClearSection: () => void;
  onSeek: (time: number) => void;
}

export default function FeedbackPanel({
  videoId,
  videoSrc,
  videoDuration,
  timeline,
  section,
  lowSections,
  onSelectSection,
  onClearSection,
  onSeek,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextScreenshotUrl, setContextScreenshotUrl] = useState<string | null>(null);
  const [contextScreenshotTime, setContextScreenshotTime] = useState<number | null>(null);

  const fetchFeedback = useCallback(async () => {
    if (!section) return;
    setLoading(true);
    setError(null);
    try {
      const totalDuration = section.video_duration ?? videoDuration;
      const captureTime = clampTime(section.start_time, totalDuration);
      const capturedScreenshot = await captureVideoFrame(videoSrc, captureTime);
      const screenshotUrl = capturedScreenshot ?? section.screenshot_url ?? null;
      const screenshotTime = capturedScreenshot
        ? captureTime
        : section.screenshot_time ?? captureTime;
      const activationContext = buildActivationContext(timeline, section);
      const request: FeedbackRequest = {
        video_id: videoId,
        section_start: section.start_time,
        section_end: section.end_time,
        transcript: section.transcript,
        modality: section.modality,
        score: section.score,
        screenshot_url: screenshotUrl,
        screenshot_time: screenshotTime,
        video_duration: totalDuration,
        activation_context: activationContext,
      };
      setContextScreenshotUrl(screenshotUrl);
      setContextScreenshotTime(screenshotTime);
      const result = await getFeedback(request);
      setFeedback(result);
    } catch (e: any) {
      setError(e.message || "Failed to get feedback");
    } finally {
      setLoading(false);
    }
  }, [section, timeline, videoDuration, videoId, videoSrc]);

  useEffect(() => {
    setFeedback(null);
    setError(null);
    if (!section) {
      setContextScreenshotUrl(null);
      setContextScreenshotTime(null);
      return;
    }
    setContextScreenshotUrl(section.screenshot_url ?? null);
    setContextScreenshotTime(section.screenshot_time ?? null);
    fetchFeedback();
  }, [section, fetchFeedback]);

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <MessageSquare size={18} color="#8b5cf6" />
            <h3 style={styles.title}>Engagement Feedback</h3>
          </div>
        </div>

        {!section ? (
          <SectionList
            sections={lowSections}
            videoDuration={videoDuration}
            onSelect={(selected) => {
              onSelectSection(selected);
              onSeek(selected.start_time);
            }}
          />
        ) : (
          <SectionDetail
            section={section}
            videoDuration={videoDuration}
            screenshotUrl={contextScreenshotUrl}
            screenshotTime={contextScreenshotTime}
            loading={loading}
            error={error}
            feedback={feedback}
            onBack={onClearSection}
            onSeek={onSeek}
            onRetry={fetchFeedback}
          />
        )}
      </div>
    </div>
  );
}

function SectionList({
  sections,
  videoDuration,
  onSelect,
}: {
  sections: LowEngagementSection[];
  videoDuration: number;
  onSelect: (section: LowEngagementSection) => void;
}) {
  if (!sections.length) {
    return <p style={styles.emptyHint}>No low-engagement sections detected. Great job!</p>;
  }

  return (
    <div>
      <p style={styles.listIntro}>
        These sections had low engagement. Open one to review the transcript, frame capture,
        and model suggestions.
      </p>
      <div style={styles.sectionCards}>
        {sections.map((sec, index) => (
          <button
            key={`${sec.start_time}-${sec.end_time}-${index}`}
            type="button"
            onClick={() => onSelect(sec)}
            style={styles.sectionCard}
          >
            <div style={styles.cardRow}>
              <AlertTriangle size={14} color="#ef4444" />
              <span style={styles.cardTime}>
                {fmtTime(sec.start_time)} - {fmtTime(sec.end_time)}
              </span>
              <span
                style={{
                  ...styles.cardBadge,
                  color: modalityColor(sec.modality),
                  borderColor: `${modalityColor(sec.modality)}55`,
                  background: `${modalityColor(sec.modality)}15`,
                }}
              >
                {sec.modality} {Math.round(sec.score * 100)}%
              </span>
            </div>
            <p style={styles.cardMeta}>{formatSectionPosition(sec, videoDuration)}</p>
            {sec.transcript && (
              <p style={styles.cardTranscript}>
                "{sec.transcript.slice(0, 80)}
                {sec.transcript.length > 80 ? "…" : ""}"
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionDetail({
  section,
  videoDuration,
  screenshotUrl,
  screenshotTime,
  loading,
  error,
  feedback,
  onBack,
  onSeek,
  onRetry,
}: {
  section: LowEngagementSection;
  videoDuration: number;
  screenshotUrl: string | null;
  screenshotTime: number | null;
  loading: boolean;
  error: string | null;
  feedback: FeedbackResponse | null;
  onBack: () => void;
  onSeek: (time: number) => void;
  onRetry: () => void;
}) {
  const totalDuration = section.video_duration ?? videoDuration;

  return (
    <div>
      <button type="button" onClick={onBack} style={styles.backBtn}>
        <ArrowLeft size={14} />
        All sections
      </button>

      <div style={styles.sectionInfo}>
        <div style={styles.sectionInfoRow}>
          <button type="button" onClick={() => onSeek(section.start_time)} style={styles.timeBtn}>
            {fmtTime(section.start_time)} - {fmtTime(section.end_time)}
          </button>
          <span style={styles.badge}>
            Low {section.modality} ({Math.round(section.score * 100)}%)
          </span>
        </div>
        <p style={styles.sectionMeta}>{formatSectionPosition(section, totalDuration)}</p>
      </div>

      {(screenshotUrl || section.transcript) && (
        <div style={styles.contextGrid}>
          {screenshotUrl && (
            <div style={styles.contextCard}>
              <p style={styles.contextLabel}>
                Screenshot
                {screenshotTime !== undefined && screenshotTime !== null
                  ? ` at ${fmtTime(screenshotTime)}`
                  : ""}
              </p>
              <img
                src={screenshotUrl}
                alt={`Frame from ${fmtTime(section.start_time)} to ${fmtTime(section.end_time)}`}
                style={styles.screenshotImage}
              />
            </div>
          )}

          {section.transcript && (
            <div style={styles.contextCard}>
              <p style={styles.contextLabel}>Transcript</p>
              <p style={styles.transcriptText}>"{section.transcript}"</p>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <Loader
            size={24}
            color="#8b5cf6"
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p>Analyzing this section with the feedback model...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={styles.error}>
          <p>{error}</p>
          <button type="button" onClick={onRetry} style={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {feedback && (
        <div style={styles.feedbackContent}>
          <div style={styles.analysis}>
            <p style={styles.analysisLabel}>Why engagement dropped</p>
            <p style={styles.analysisText}>{feedback.feedback}</p>
          </div>
          <div style={styles.suggestions}>
            <div style={styles.suggestionsHeader}>
              <Lightbulb size={16} color="#f59e0b" />
              <span style={styles.suggestionsTitle}>Suggestions</span>
            </div>
            {feedback.suggestions.map((suggestion, index) => (
              <div key={`${index}-${suggestion.slice(0, 24)}`} style={styles.suggestion}>
                <span style={styles.suggestionNum}>{index + 1}</span>
                <p style={styles.suggestionText}>{suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(time: number) {
  const safe = Math.max(0, time);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clampTime(time: number, duration: number) {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  if (!Number.isFinite(duration) || duration <= 0) return safeTime;
  return Math.min(safeTime, Math.max(0, duration - 0.05));
}

function buildActivationContext(
  timeline: TimelinePoint[],
  section: LowEngagementSection
): FeedbackActivationContext | null {
  if (!timeline.length) return null;

  const sectionPoints = timeline.filter(
    (point) => point.time >= section.start_time && point.time <= section.end_time
  );
  const effectiveSectionPoints = sectionPoints.length
    ? sectionPoints
    : dedupePoints([
        closestPoint(timeline, section.start_time),
        closestPoint(timeline, section.end_time),
      ]);

  if (!effectiveSectionPoints.length) return null;

  return {
    sample_count: effectiveSectionPoints.length,
    section_average: aggregateSnapshot(effectiveSectionPoints, "avg"),
    overall_average: aggregateSnapshot(timeline, "avg"),
    section_minimum: aggregateSnapshot(effectiveSectionPoints, "min"),
    section_maximum: aggregateSnapshot(effectiveSectionPoints, "max"),
    section_start: snapshotFromPoint(
      closestPoint(timeline, section.start_time) ?? effectiveSectionPoints[0]
    ),
    section_end: snapshotFromPoint(
      closestPoint(timeline, section.end_time) ??
        effectiveSectionPoints[effectiveSectionPoints.length - 1]
    ),
  };
}

function dedupePoints(points: Array<TimelinePoint | null>) {
  const seen = new Set<number>();
  const out: TimelinePoint[] = [];
  for (const point of points) {
    if (!point || seen.has(point.time)) continue;
    seen.add(point.time);
    out.push(point);
  }
  return out;
}

function closestPoint(timeline: TimelinePoint[], targetTime: number) {
  let closest: TimelinePoint | null = null;
  let minDistance = Infinity;

  for (const point of timeline) {
    const distance = Math.abs(point.time - targetTime);
    if (distance < minDistance) {
      minDistance = distance;
      closest = point;
    }
  }

  return closest;
}

function snapshotFromPoint(point: TimelinePoint): ActivationSnapshot {
  return {
    visual: point.visual,
    audio: point.audio,
    text: point.text,
  };
}

function aggregateSnapshot(
  points: TimelinePoint[],
  mode: "avg" | "min" | "max"
): ActivationSnapshot {
  const visualValues = points.map((point) => point.visual);
  const audioValues = points.map((point) => point.audio);
  const textValues = points.map((point) => point.text);

  return {
    visual: aggregateValues(visualValues, mode),
    audio: aggregateValues(audioValues, mode),
    text: aggregateValues(textValues, mode),
  };
}

function aggregateValues(values: number[], mode: "avg" | "min" | "max") {
  if (!values.length) return 0;
  if (mode === "avg") {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  if (mode === "min") {
    return Math.min(...values);
  }
  return Math.max(...values);
}

async function captureVideoFrame(videoSrc: string, time: number): Promise<string | null> {
  if (!videoSrc) return null;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    let timeoutId = 0;
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeAttribute("src");
      video.load();
    };

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const drawFrame = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(null);
        return;
      }

      const scale = Math.min(1, 960 / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        finish(null);
        return;
      }

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        finish(null);
      }
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    video.addEventListener("error", () => finish(null), { once: true });
    video.addEventListener("seeked", drawFrame, { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        const targetTime = clampTime(time, video.duration);
        if (targetTime <= 0.05) {
          if (video.readyState >= 2) drawFrame();
          else video.addEventListener("loadeddata", drawFrame, { once: true });
          return;
        }
        video.currentTime = targetTime;
      },
      { once: true }
    );

    timeoutId = window.setTimeout(() => finish(null), 8000);
    video.src = videoSrc;
    video.load();
  });
}

function formatSectionPosition(section: LowEngagementSection, videoDuration: number) {
  if (!videoDuration || videoDuration <= 0) {
    return `${fmtTime(section.start_time)} - ${fmtTime(section.end_time)}`;
  }
  const startPct = (section.start_time / videoDuration) * 100;
  const endPct = (section.end_time / videoDuration) * 100;
  return `${fmtTime(section.start_time)} - ${fmtTime(section.end_time)} of ${fmtTime(videoDuration)} total (${Math.round(startPct)}%-${Math.round(endPct)}% through)`;
}

function modalityColor(modality: string) {
  if (modality === "visual") return "#f97316";
  if (modality === "text") return "#22c55e";
  return "#3b82f6";
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 430,
    background: "#0d0d14",
    borderLeft: "1px solid #222",
    zIndex: 100,
    overflowY: "auto",
    boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
  },
  panel: {
    padding: "1.25rem",
  },
  header: {
    marginBottom: "1rem",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  title: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#e0e0e0",
    margin: 0,
  },
  listIntro: {
    fontSize: "0.82rem",
    color: "#888",
    lineHeight: 1.5,
    marginBottom: "1rem",
  },
  emptyHint: {
    fontSize: "0.88rem",
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    padding: "2rem 0",
  },
  sectionCards: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  sectionCard: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    padding: "0.8rem 0.9rem",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #2a2a3e",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.15s, background 0.15s",
  },
  cardRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  cardTime: {
    fontSize: "0.82rem",
    color: "#c4b5fd",
    fontFamily: "monospace",
  },
  cardBadge: {
    fontSize: "0.7rem",
    fontWeight: 600,
    textTransform: "uppercase",
    padding: "0.15rem 0.4rem",
    borderRadius: 4,
    border: "1px solid",
    marginLeft: "auto",
  },
  cardMeta: {
    fontSize: "0.73rem",
    color: "#71717a",
    lineHeight: 1.4,
    margin: 0,
  },
  cardTranscript: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    lineHeight: 1.45,
    fontStyle: "italic",
    margin: 0,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    background: "none",
    border: "none",
    color: "#8b5cf6",
    fontSize: "0.82rem",
    fontWeight: 500,
    cursor: "pointer",
    padding: "0.25rem 0",
    marginBottom: "0.75rem",
  },
  sectionInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    marginBottom: "1rem",
  },
  sectionInfoRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
  },
  sectionMeta: {
    fontSize: "0.76rem",
    color: "#71717a",
    margin: 0,
    lineHeight: 1.4,
  },
  timeBtn: {
    background: "rgba(139, 92, 246, 0.15)",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    borderRadius: 6,
    padding: "0.3rem 0.6rem",
    color: "#c4b5fd",
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "monospace",
  },
  badge: {
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 6,
    padding: "0.3rem 0.6rem",
    color: "#fca5a5",
    fontSize: "0.75rem",
  },
  contextGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "0.85rem",
    marginBottom: "1rem",
  },
  contextCard: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: "0.75rem",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  contextLabel: {
    fontSize: "0.68rem",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 0.45rem 0",
  },
  screenshotImage: {
    width: "100%",
    display: "block",
    borderRadius: 8,
    objectFit: "cover",
    aspectRatio: "16 / 9",
    background: "#111827",
  },
  transcriptText: {
    fontSize: "0.84rem",
    color: "#aaa",
    lineHeight: 1.55,
    fontStyle: "italic",
    margin: 0,
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    padding: "2rem",
    color: "#888",
    fontSize: "0.9rem",
  },
  error: {
    textAlign: "center",
    padding: "1.5rem",
    color: "#ef4444",
    fontSize: "0.9rem",
  },
  retryBtn: {
    marginTop: "0.75rem",
    padding: "0.4rem 1rem",
    background: "rgba(139, 92, 246, 0.2)",
    border: "1px solid #8b5cf6",
    borderRadius: 6,
    color: "#c4b5fd",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  feedbackContent: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  analysis: {
    background: "rgba(139, 92, 246, 0.06)",
    borderLeft: "3px solid #8b5cf6",
    borderRadius: "0 8px 8px 0",
    padding: "0.75rem 1rem",
  },
  analysisLabel: {
    fontSize: "0.72rem",
    color: "#a78bfa",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 0.45rem 0",
  },
  analysisText: {
    fontSize: "0.88rem",
    color: "#ccc",
    lineHeight: 1.6,
    margin: 0,
  },
  suggestions: {
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: "1rem",
  },
  suggestionsHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  suggestionsTitle: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#f59e0b",
  },
  suggestion: {
    display: "flex",
    gap: "0.75rem",
    marginBottom: "0.75rem",
    alignItems: "flex-start",
  },
  suggestionNum: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(245, 158, 11, 0.15)",
    color: "#f59e0b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    fontWeight: 700,
    flexShrink: 0,
  },
  suggestionText: {
    fontSize: "0.85rem",
    color: "#bbb",
    lineHeight: 1.5,
    margin: 0,
  },
};
