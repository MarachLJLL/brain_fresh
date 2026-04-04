import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Loader, X, Lightbulb } from "lucide-react";
import type { FeedbackResponse, LowEngagementSection } from "../types";
import { getFeedback } from "../services/api";

interface Props {
  videoId: string;
  section: LowEngagementSection | null;
  onClose: () => void;
  onSeek: (time: number) => void;
  /** When provided, bypasses the API and uses this for feedback (demo mode). */
  getFeedbackOverride?: (section: LowEngagementSection) => Promise<FeedbackResponse>;
}

export default function FeedbackPanel({
  videoId,
  section,
  onClose,
  onSeek,
  getFeedbackOverride,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    if (!section) return;
    setLoading(true);
    setError(null);
    try {
      const result = getFeedbackOverride
        ? await getFeedbackOverride(section)
        : await getFeedback({
            video_id: videoId,
            section_start: section.start_time,
            section_end: section.end_time,
            transcript: section.transcript,
            modality: section.modality,
            score: section.score,
          });
      setFeedback(result);
    } catch (e: any) {
      setError(e.message || "Failed to get feedback");
    } finally {
      setLoading(false);
    }
  }, [section, videoId, getFeedbackOverride]);

  useEffect(() => {
    if (section) {
      setFeedback(null);
      fetchFeedback();
    }
  }, [section, fetchFeedback]);

  if (!section) return null;

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <MessageSquare size={18} color="#8b5cf6" />
            <h3 style={styles.title}>Engagement Feedback</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.sectionInfo}>
          <button
            onClick={() => onSeek(section.start_time)}
            style={styles.timeBtn}
          >
            {formatTime(section.start_time)} - {formatTime(section.end_time)}
          </button>
          <span style={styles.badge}>
            Low {section.modality} ({(section.score * 100).toFixed(0)}%)
          </span>
        </div>

        {section.transcript && (
          <div style={styles.transcript}>
            <p style={styles.transcriptLabel}>Transcript:</p>
            <p style={styles.transcriptText}>"{section.transcript}"</p>
          </div>
        )}

        {loading && (
          <div style={styles.loading}>
            <Loader
              size={24}
              color="#8b5cf6"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <p>Analyzing with Claude...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div style={styles.error}>
            <p>{error}</p>
            <button onClick={fetchFeedback} style={styles.retryBtn}>
              Retry
            </button>
          </div>
        )}

        {feedback && (
          <div style={styles.feedbackContent}>
            <div style={styles.analysis}>
              <p style={styles.analysisText}>{feedback.feedback}</p>
            </div>

            <div style={styles.suggestions}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <Lightbulb size={16} color="#f59e0b" />
                <span style={styles.suggestionsTitle}>Suggestions</span>
              </div>
              {feedback.suggestions.map((s, i) => (
                <div key={i} style={styles.suggestion}>
                  <span style={styles.suggestionNum}>{i + 1}</span>
                  <p style={styles.suggestionText}>{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 420,
    background: "#0d0d14",
    borderLeft: "1px solid #222",
    zIndex: 100,
    overflowY: "auto",
    boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
  },
  panel: {
    padding: "1.5rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
  },
  title: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#e0e0e0",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#666",
    cursor: "pointer",
    padding: 4,
  },
  sectionInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1rem",
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
  transcript: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.75rem",
    marginBottom: "1rem",
  },
  transcriptLabel: {
    fontSize: "0.7rem",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: "0.3rem",
  },
  transcriptText: {
    fontSize: "0.85rem",
    color: "#aaa",
    lineHeight: 1.5,
    fontStyle: "italic",
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
  analysisText: {
    fontSize: "0.88rem",
    color: "#ccc",
    lineHeight: 1.6,
  },
  suggestions: {
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: "1rem",
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
  },
};
