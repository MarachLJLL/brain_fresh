import { useCallback, useMemo, useState } from "react";
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
import { generateMockAnalysis, generateMockFeedback } from "./utils/mockAnalysis";
import type {
  AnalysisResult,
  AppState,
  LowEngagementSection,
  ProcessingStatus,
  TimelinePoint,
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
  const [demoVideoUrl, setDemoVideoUrl] = useState<string | null>(null);

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
    if (demoVideoUrl) URL.revokeObjectURL(demoVideoUrl);
    setDemoVideoUrl(null);
    setAppState("upload");
    setAnalysis(null);
    setVideoId("");
    setSelectedSection(null);
  }, [demoVideoUrl]);

  const handleDemoUpload = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setDemoVideoUrl(url);
    setVideoId("demo");

    let dur = 90;
    try {
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.src = url;
      dur = await new Promise<number>((resolve) => {
        vid.onloadedmetadata = () => resolve(vid.duration || 90);
        setTimeout(() => resolve(90), 3000);
      });
    } catch { /* use default 90s */ }

    setAnalysis(generateMockAnalysis(Math.round(dur)));
    setAppState("results");
  }, []);

  const brainActivations = analysis?.brain_activations ?? [];
  const showResults = appState === "results" && analysis !== null;
  const videoSrc = demoVideoUrl ?? getVideoUrl(videoId);

  const currentTimelineDrives = useMemo(() => {
    if (!analysis?.timeline?.length) return undefined;
    // Don't drive brain glow until the user has started playing
    if (currentTime <= 0 && !isPlaying) return undefined;
    let closest: TimelinePoint | null = null;
    let minDist = Infinity;
    for (const pt of analysis.timeline) {
      const d = Math.abs(pt.time - currentTime);
      if (d < minDist) { minDist = d; closest = pt; }
    }
    if (!closest) return undefined;
    return { visual: closest.visual, audio: closest.audio, text: closest.text };
  }, [analysis, currentTime, isPlaying]);

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
              <>
                <VideoUpload embedded onUpload={handleUpload} />
                <DemoSection onDemoFile={handleDemoUpload} />
              </>
            )}
            {appState === "processing" &&
              (videoId ? (
                <div style={styles.processingWrap}>
                  <VideoPlayer
                    ref={videoRef}
                    src={videoSrc}
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
                src={videoSrc}
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
              timelineDrives={currentTimelineDrives}
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
        getFeedbackOverride={demoVideoUrl ? generateMockFeedback : undefined}
      />
    </div>
  );
}

function DemoSection({ onDemoFile }: { onDemoFile: (file: File) => void }) {
  return (
    <div style={demoStyles.container}>
      <div style={demoStyles.divider}>
        <span style={demoStyles.dividerLine} />
        <span style={demoStyles.dividerText}>or try demo mode</span>
        <span style={demoStyles.dividerLine} />
      </div>
      <p style={demoStyles.hint}>
        Pick any video file to see a simulated analysis — no backend needed.
      </p>
      <label style={demoStyles.button}>
        Demo with your video
        <input
          type="file"
          accept="video/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onDemoFile(f);
          }}
        />
      </label>
    </div>
  );
}

const demoStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    marginTop: "1.25rem",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#333",
  },
  dividerText: {
    fontSize: "0.78rem",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  },
  hint: {
    fontSize: "0.82rem",
    color: "#777",
    textAlign: "center",
    lineHeight: 1.4,
    margin: 0,
  },
  button: {
    padding: "0.6rem 1.5rem",
    background: "rgba(139, 92, 246, 0.12)",
    border: "1.5px solid rgba(139, 92, 246, 0.4)",
    borderRadius: 8,
    color: "#c4b5fd",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },
};

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
