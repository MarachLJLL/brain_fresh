import { forwardRef } from "react";
import { Play, Pause } from "lucide-react";

interface Props {
  src: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
}

const VideoPlayer = forwardRef<HTMLVideoElement, Props>(
  ({ src, isPlaying, currentTime, duration, onTogglePlay }, ref) => {
    const formatTime = (t: number) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
      <div style={styles.container}>
        <div style={styles.videoWrap}>
          <video
            ref={ref}
            src={src}
            style={styles.video}
            playsInline
          />
        </div>
        <div style={styles.controls}>
          <button onClick={onTogglePlay} style={styles.playBtn}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span style={styles.time}>
            {formatTime(currentTime)} / {formatTime(duration || 0)}
          </span>
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    background: "#000",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #222",
  },
  videoWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "16/9",
    background: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 1rem",
    background: "#111",
  },
  playBtn: {
    background: "none",
    border: "none",
    color: "#e0e0e0",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
  },
  time: {
    fontSize: "0.8rem",
    color: "#888",
    fontFamily: "monospace",
  },
};
