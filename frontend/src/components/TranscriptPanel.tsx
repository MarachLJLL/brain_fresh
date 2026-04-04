import { useEffect, useRef } from "react";
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
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentTime]);

  if (!segments.length) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>
          <FileText size={16} /> Transcript
        </h3>
        <p style={styles.empty}>No transcript available for this video.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>
        <FileText size={16} /> Transcript & Audio
      </h3>
      <div style={styles.list}>
        {segments.map((seg, i) => {
          const isActive = currentTime >= seg.start && currentTime <= seg.end;
          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSeek(seg.start)}
              style={{
                ...styles.segment,
                background: isActive
                  ? "rgba(139, 92, 246, 0.1)"
                  : "transparent",
                borderLeftColor: isActive ? "#8b5cf6" : "transparent",
              }}
            >
              <span style={styles.timestamp}>
                {formatTime(seg.start)}
              </span>
              <p style={{ ...styles.text, color: isActive ? "#e0e0e0" : "#888" }}>
                {seg.text}
              </p>
            </div>
          );
        })}
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
    borderRadius: 12,
    padding: "1rem",
    maxHeight: 350,
    display: "flex",
    flexDirection: "column",
  },
  title: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#ccc",
    marginBottom: "0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  list: {
    overflowY: "auto",
    flex: 1,
  },
  segment: {
    padding: "0.5rem 0.75rem",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s",
    borderRadius: "0 4px 4px 0",
    marginBottom: 2,
  },
  timestamp: {
    fontSize: "0.7rem",
    color: "#666",
    fontFamily: "monospace",
  },
  text: {
    fontSize: "0.82rem",
    lineHeight: 1.5,
    marginTop: 2,
  },
  empty: {
    color: "#555",
    fontSize: "0.85rem",
    fontStyle: "italic",
  },
};
