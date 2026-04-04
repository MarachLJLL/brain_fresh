import { useCallback, useState } from "react";
import VideoUpload from "./components/VideoUpload";
import LoadingScreen from "./components/LoadingScreen";
import VideoPlayer from "./components/VideoPlayer";
import Timeline from "./components/Timeline";
import BrainModel from "./components/BrainModel";
import FeedbackPanel from "./components/FeedbackPanel";
import TranscriptPanel from "./components/TranscriptPanel";
import { useVideoSync } from "./hooks/useVideoSync";
import {
  uploadVideo,
  connectProcessingWs,
  getAnalysisResult,
  getVideoUrl,
} from "./services/api";
import type {
  AnalysisResult,
  AppState,
  LowEngagementSection,
  ProcessingStatus,
} from "./types";

export default function App() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [videoId, setVideoId] = useState<string>("");
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    status: "uploading",
    progress: 0,
    message: "",
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedSection, setSelectedSection] =
    useState<LowEngagementSection | null>(null);

  const { videoRef, currentTime, duration, isPlaying, seekTo, togglePlay } =
    useVideoSync();

  const handleUpload = useCallback(async (file: File) => {
    setAppState("processing");
    setProcessingStatus({
      status: "uploading",
      progress: 2,
      message: "Uploading video...",
    });

    try {
      const { video_id } = await uploadVideo(file);
      setVideoId(video_id);

      setProcessingStatus({
        status: "uploading",
        progress: 5,
        message: "Upload complete. Starting analysis...",
      });

      // Connect WebSocket for real-time progress
      connectProcessingWs(
        video_id,
        (status) => setProcessingStatus(status),
        async () => {
          // Fetch full results when processing completes
          const result = await getAnalysisResult(video_id);
          setAnalysis(result);
          setAppState("results");
        },
        (err) => {
          setProcessingStatus({
            status: "error",
            progress: 0,
            message: err,
          });
        }
      );
    } catch (e: any) {
      setProcessingStatus({
        status: "error",
        progress: 0,
        message: e.message || "Upload failed",
      });
    }
  }, []);

  const handleSectionClick = useCallback(
    (section: LowEngagementSection) => {
      setSelectedSection(section);
      seekTo(section.start_time);
    },
    [seekTo]
  );

  // --- Upload screen ---
  if (appState === "upload") {
    return <VideoUpload onUpload={handleUpload} />;
  }

  // --- Processing screen ---
  if (appState === "processing") {
    return <LoadingScreen status={processingStatus} />;
  }

  // --- Results screen ---
  if (!analysis) return null;

  return (
    <div style={styles.layout}>
      {/* Main content area */}
      <div
        style={{
          ...styles.main,
          marginRight: selectedSection ? 420 : 0,
        }}
      >
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.logo}>Brain Fresh</h1>
          <button onClick={() => { setAppState("upload"); setAnalysis(null); }} style={styles.newBtn}>
            New Video
          </button>
        </header>

        {/* Video + Brain model row */}
        <div style={styles.topRow}>
          <div style={styles.videoCol}>
            <VideoPlayer
              ref={videoRef}
              src={getVideoUrl(videoId)}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onTogglePlay={togglePlay}
            />
          </div>
          <div style={styles.brainCol}>
            <BrainModel
              activations={analysis.brain_activations}
              currentTime={currentTime}
            />
          </div>
        </div>

        {/* Timeline graph */}
        <Timeline
          data={analysis.timeline}
          currentTime={currentTime}
          duration={analysis.duration}
          lowSections={analysis.low_engagement_sections}
          onSeek={seekTo}
          onSectionClick={handleSectionClick}
        />

        {/* Transcript */}
        <TranscriptPanel
          segments={analysis.transcript_segments}
          currentTime={currentTime}
          onSeek={seekTo}
        />
      </div>

      {/* Feedback side panel */}
      <FeedbackPanel
        videoId={videoId}
        section={selectedSection}
        onClose={() => setSelectedSection(null)}
        onSeek={seekTo}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    minHeight: "100vh",
    background: "#0a0a0f",
  },
  main: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "1rem 1.5rem 3rem",
    transition: "margin-right 0.3s ease",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 0 1.5rem",
  },
  logo: {
    fontSize: "1.3rem",
    fontWeight: 700,
    background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  newBtn: {
    padding: "0.5rem 1rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#aaa",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: "1rem",
    marginBottom: "1rem",
  },
  videoCol: {
    minWidth: 0,
  },
  brainCol: {
    minWidth: 0,
  },
};
