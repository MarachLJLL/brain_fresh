import { useMemo } from "react";
import { FileText } from "lucide-react";
import type { TranscriptSegment } from "../types";

interface Props {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
}: Props) {
  const active = useMemo(() => {
    for (const seg of segments) {
      if (currentTime >= seg.start && currentTime <= seg.end) return seg;
    }
    return null;
  }, [segments, currentTime]);

  if (!segments.length) {
    return (
      <div style={styles.container}>
        <div style={styles.row}>
          <FileText size={14} color="#666" />
          <span style={styles.empty}>No transcript available</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <FileText size={14} color="#8b5cf6" style={{ flexShrink: 0 }} />
        {active ? (
          <>
            <span style={styles.timestamp}>{formatTime(active.start)}</span>
            <p style={styles.text}>{active.text}</p>
          </>
        ) : (
          <span style={styles.empty}>...</span>
        )}
      </div>
    </div>
  );
}

function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #222",
    borderRadius: 10,
    padding: "0.6rem 1rem",
    marginTop: "0.5rem",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    minHeight: 24,
  },
  timestamp: {
    fontSize: "0.72rem",
    color: "#8b5cf6",
    fontFamily: "monospace",
    flexShrink: 0,
  },
  text: {
    fontSize: "0.88rem",
    color: "#d0d0d0",
    lineHeight: 1.45,
    margin: 0,
  },
  empty: {
    color: "#555",
    fontSize: "0.85rem",
    fontStyle: "italic",
  },
};
