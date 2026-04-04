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

      connectProcessingWs(
        video_id,
        (status) => setProcessingStatus(status),
        async () => {
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

  const handleNewVideo = useCallback(() => {
    setAppState("upload");
    setAnalysis(null);
    setVideoId("");
    setSelectedSection(null);
  }, []);

  const brainActivations = analysis?.brain_activations ?? [];
  const showResults = appState === "results" && analysis !== null;

  const handleImportAnalysisJson = (data: AnalysisResult) => {
    setAnalysis({ ...data, video_id: videoId });
    setAppState("results");
  };

  return (
    <div style={styles.layout}>
      <div
        style={{
          ...styles.main,
          marginRight: selectedSection ? 420 : 0,
        }}
      >
        <header style={styles.header}>
          <h1 style={styles.logo}>Brain Fresh</h1>
          {appState !== "upload" && (
            <button type="button" onClick={handleNewVideo} style={styles.newBtn}>
              New Video
            </button>
          )}
        </header>

        <div style={styles.topRow}>
          <div style={styles.videoCol}>
            {appState === "upload" && (
              <VideoUpload embedded onUpload={handleUpload} />
            )}
            {appState === "processing" &&
              (videoId ? (
                <div style={styles.processingWrap}>
                  <VideoPlayer
                    ref={videoRef}
                    src={getVideoUrl(videoId)}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    onTogglePlay={togglePlay}
                  />
                  <div style={styles.processingOverlay}>
                    <LoadingScreen
                      embedded
                      status={processingStatus}
                      videoId={videoId}
                      onImportAnalysisJson={handleImportAnalysisJson}
                    />
                  </div>
                </div>
              ) : (
                <LoadingScreen
                  embedded
                  status={processingStatus}
                  videoId={videoId}
                  onImportAnalysisJson={handleImportAnalysisJson}
                />
              ))}
            {showResults && (
              <VideoPlayer
                ref={videoRef}
                src={getVideoUrl(videoId)}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                onTogglePlay={togglePlay}
              />
            )}
          </div>
          <div style={styles.brainCol}>
            <BrainModel
              activations={brainActivations}
              currentTime={currentTime}
            />
          </div>
        </div>

        {showResults && (
          <>
            <Timeline
              data={analysis.timeline}
              currentTime={currentTime}
              duration={analysis.duration}
              lowSections={analysis.low_engagement_sections}
              onSeek={seekTo}
              onSectionClick={handleSectionClick}
            />
            <TranscriptPanel
              segments={analysis.transcript_segments}
              currentTime={currentTime}
              onSeek={seekTo}
            />
          </>
        )}
      </div>

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
    alignItems: "start",
  },
  videoCol: {
    minWidth: 0,
  },
  brainCol: {
    minWidth: 0,
  },
  processingWrap: {
    position: "relative",
    width: "100%",
    minWidth: 0,
  },
  processingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10, 10, 15, 0.85)",
    backdropFilter: "blur(8px)",
    borderRadius: 12,
  },
};
