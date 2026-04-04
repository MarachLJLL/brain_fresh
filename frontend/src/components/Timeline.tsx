import { useCallback, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { LowEngagementSection, TimelinePoint } from "../types";

interface Props {
  data: TimelinePoint[];
  currentTime: number;
  duration: number;
  lowSections: LowEngagementSection[];
  onSeek: (time: number) => void;
  onSectionClick: (section: LowEngagementSection) => void;
}

export default function Timeline({
  data,
  currentTime,
  duration,
  lowSections,
  onSeek,
  onSectionClick,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: any) => {
      if (e?.activeLabel != null) {
        onSeek(Number(e.activeLabel));
      }
    },
    [onSeek]
  );

  // Downsample data if too many points for smooth rendering
  const chartData = useMemo(() => {
    if (data.length <= 600) return data;
    const step = Math.ceil(data.length / 600);
    return data.filter((_, i) => i % step === 0);
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const t = Number(label);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return (
      <div style={styles.tooltip}>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>
          {m}:{s.toString().padStart(2, "0")}
        </p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color, fontSize: "0.8rem" }}>
            {p.dataKey}: {p.value.toFixed(3)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Engagement Timeline</h3>
        <div style={styles.legend}>
          <LegendItem color="#f97316" label="Visual" />
          <LegendItem color="#22c55e" label="Text" />
          <LegendItem color="#3b82f6" label="Audio" />
        </div>
      </div>
      <div ref={chartRef} style={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} onClick={handleClick}>
            <XAxis
              dataKey="time"
              tick={{ fill: "#555", fontSize: 11 }}
              tickFormatter={(v) => {
                const m = Math.floor(v / 60);
                const s = Math.floor(v % 60);
                return `${m}:${s.toString().padStart(2, "0")}`;
              }}
              stroke="#333"
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "#555", fontSize: 11 }}
              width={30}
              stroke="#333"
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Low engagement regions */}
            {lowSections.map((sec, i) => (
              <ReferenceArea
                key={i}
                x1={sec.start_time}
                x2={sec.end_time}
                fill="rgba(239, 68, 68, 0.12)"
                stroke="rgba(239, 68, 68, 0.3)"
                strokeDasharray="3 3"
                onClick={() => onSectionClick(sec)}
                style={{ cursor: "pointer" }}
              />
            ))}

            {/* Playhead */}
            <ReferenceLine
              x={currentTime}
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="4 2"
            />

            <Line
              type="monotone"
              dataKey="visual"
              stroke="#f97316"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="text"
              stroke="#22c55e"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="audio"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Low engagement section labels */}
      {lowSections.length > 0 && (
        <div style={styles.lowSections}>
          <p style={styles.lowTitle}>Low Engagement Sections (click for feedback):</p>
          {lowSections.map((sec, i) => (
            <button
              key={i}
              onClick={() => onSectionClick(sec)}
              style={styles.lowBtn}
            >
              {formatRange(sec.start_time, sec.end_time)} — weak{" "}
              <span style={{ color: modalityColor(sec.modality) }}>
                {sec.modality}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: 12,
          height: 3,
          borderRadius: 2,
          background: color,
        }}
      />
      <span style={{ fontSize: "0.75rem", color: "#888" }}>{label}</span>
    </div>
  );
}

function formatRange(a: number, b: number) {
  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  return `${fmt(a)} - ${fmt(b)}`;
}

function modalityColor(m: string): string {
  if (m === "visual") return "#f97316";
  if (m === "text") return "#22c55e";
  return "#3b82f6";
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #222",
    borderRadius: 12,
    padding: "1rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.75rem",
  },
  title: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#ccc",
  },
  legend: {
    display: "flex",
    gap: "1rem",
  },
  chartWrap: {
    width: "100%",
    cursor: "crosshair",
  },
  tooltip: {
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "0.5rem 0.75rem",
    fontSize: "0.8rem",
  },
  lowSections: {
    marginTop: "0.75rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid #222",
  },
  lowTitle: {
    fontSize: "0.8rem",
    color: "#ef4444",
    marginBottom: "0.5rem",
  },
  lowBtn: {
    display: "inline-block",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 6,
    padding: "0.35rem 0.75rem",
    color: "#e0e0e0",
    fontSize: "0.8rem",
    cursor: "pointer",
    marginRight: "0.5rem",
    marginBottom: "0.35rem",
  },
};
