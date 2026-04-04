import type { AnalysisResult, ProcessingStatus } from "../types";
import { Brain } from "lucide-react";
import { useRef } from "react";

interface Props {
  status: ProcessingStatus;
  /** When true, fits beside the brain preview instead of full viewport */
  embedded?: boolean;
  videoId?: string;
  onImportAnalysisJson?: (data: AnalysisResult) => void;
}

export default function LoadingScreen({
  status,
  embedded,
  videoId,
  onImportAnalysisJson,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div style={embedded ? styles.containerEmbedded : styles.container}>
      <div style={embedded ? styles.cardEmbedded : styles.card}>
        <div style={styles.iconWrap}>
          <Brain
            size={embedded ? 36 : 48}
            color="#8b5cf6"
            style={{ animation: "pulse 2s ease-in-out infinite" }}
          />
        </div>
        <h2 style={embedded ? styles.titleEmbedded : styles.title}>
          Analyzing Your Video
        </h2>
        {videoId ? (
          <p style={styles.videoIdLine}>
            Video ID for Colab export: <code style={styles.code}>{videoId}</code>
          </p>
        ) : null}
        <p style={styles.message}>{status.message || "Preparing..."}</p>

        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressBar,
              width: `${status.progress}%`,
            }}
          />
        </div>
        <p style={styles.percent}>{Math.round(status.progress)}%</p>

        <div style={styles.steps}>
          <Step
            label="Upload"
            done={status.progress > 0}
            active={status.status === "uploading"}
          />
          <Step
            label="Extract Features"
            done={status.progress > 20}
            active={status.status === "extracting_features"}
          />
          <Step
            label="Brain Predictions"
            done={status.progress > 85}
            active={status.status === "predicting"}
          />
          <Step
            label="Analyze Engagement"
            done={status.progress > 95}
            active={status.status === "analyzing"}
          />
          <Step
            label="Complete"
            done={status.status === "complete"}
            active={false}
          />
        </div>

        {status.status === "error" && onImportAnalysisJson ? (
          <div style={styles.importBox}>
            <p style={styles.importTitle}>Ran inference in Colab?</p>
            <p style={styles.importHint}>
              Export <code style={styles.code}>analysis_export.json</code> (see{" "}
              <code style={styles.code}>notebooks/colab_brain_fresh_export.ipynb</code>
              ), then load it here. Playback still uses the video you uploaded.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const raw = JSON.parse(await f.text()) as unknown;
                  const data = raw as AnalysisResult;
                  if (
                    !data ||
                    typeof data !== "object" ||
                    !Array.isArray(data.timeline) ||
                    typeof data.duration !== "number"
                  ) {
                    alert("Invalid JSON: expected Brain Fresh AnalysisResult shape.");
                    return;
                  }
                  onImportAnalysisJson(data);
                } catch {
                  alert("Could not parse JSON file.");
                }
              }}
            />
            <button
              type="button"
              style={styles.importBtn}
              onClick={() => fileRef.current?.click()}
            >
              Load analysis JSON
            </button>
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

function Step({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        opacity: done || active ? 1 : 0.4,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: done ? "#22c55e" : active ? "#8b5cf6" : "#444",
          boxShadow: active ? "0 0 8px #8b5cf6" : "none",
        }}
      />
      <span
        style={{
          fontSize: "0.85rem",
          color: active ? "#e0e0e0" : "#888",
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
  },
  containerEmbedded: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    padding: "0.5rem",
    width: "100%",
  },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #222",
    borderRadius: 16,
    padding: "3rem",
    textAlign: "center",
    maxWidth: 480,
    width: "100%",
  },
  cardEmbedded: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #222",
    borderRadius: 16,
    padding: "1.25rem 1.5rem",
    textAlign: "center",
    maxWidth: "100%",
    width: "100%",
  },
  iconWrap: {
    marginBottom: "1.5rem",
  },
  titleEmbedded: {
    fontSize: "1.15rem",
    fontWeight: 700,
    color: "#e0e0e0",
    marginBottom: "0.35rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#e0e0e0",
    marginBottom: "0.5rem",
  },
  message: {
    color: "#999",
    fontSize: "0.95rem",
    marginBottom: "1.5rem",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    background: "#1a1a2e",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #8b5cf6, #06b6d4)",
    borderRadius: 3,
    transition: "width 0.5s ease",
  },
  percent: {
    color: "#8b5cf6",
    fontSize: "0.85rem",
    marginTop: "0.5rem",
    marginBottom: "2rem",
  },
  steps: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    alignItems: "flex-start",
    paddingLeft: "1rem",
  },
  videoIdLine: {
    color: "#888",
    fontSize: "0.8rem",
    marginBottom: "0.5rem",
  },
  code: {
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.85em",
    background: "#1a1a2e",
    padding: "0.1rem 0.35rem",
    borderRadius: 4,
    color: "#c4b5fd",
  },
  importBox: {
    marginTop: "2rem",
    paddingTop: "1.5rem",
    borderTop: "1px solid #2a2a3e",
    textAlign: "left" as const,
  },
  importTitle: {
    color: "#e0e0e0",
    fontSize: "0.95rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
  },
  importHint: {
    color: "#777",
    fontSize: "0.8rem",
    lineHeight: 1.5,
    marginBottom: "1rem",
  },
  importBtn: {
    padding: "0.5rem 1rem",
    background: "rgba(139, 92, 246, 0.2)",
    border: "1px solid #6d28d9",
    borderRadius: 8,
    color: "#c4b5fd",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
};
