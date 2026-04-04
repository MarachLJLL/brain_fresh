import { useCallback, useMemo, useRef, useState } from "react";
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
  const [isRealAnalysis, setIsRealAnalysis] = useState(false);

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

  const handleNewVideo = useCallback(() => {
    if (demoVideoUrl) URL.revokeObjectURL(demoVideoUrl);
    setDemoVideoUrl(null);
    setIsRealAnalysis(false);
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

  const handleImportAnalysisJson = useCallback((data: AnalysisResult) => {
    setAnalysis({ ...data, video_id: videoId });
    setAppState("results");
  }, [videoId]);

  const handleImportAnalysis = useCallback(async (videoFile: File, analysisJson: AnalysisResult) => {
    const url = URL.createObjectURL(videoFile);
    setDemoVideoUrl(url);
    setIsRealAnalysis(true);
    setVideoId("imported");
    setAnalysis(analysisJson);
    setAppState("results");
  }, []);

  const handleLoadPreprocessed = useCallback(async () => {
    try {
      const resp = await fetch("/demo/analysis_processed.json");
      if (!resp.ok) throw new Error("Failed to load processed analysis");
      const data: AnalysisResult = await resp.json();
      setDemoVideoUrl("/demo/demo-video.mov");
      setIsRealAnalysis(true);
      setVideoId("preprocessed");
      setAnalysis(data);
      setAppState("results");
    } catch (e: any) {
      console.error("Failed to load preprocessed demo:", e);
    }
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

  return (
    <div style={styles.layout}>
      <div
        style={{
          ...styles.main,
          marginRight: showResults ? 390 : 0,
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

        {/* Video + Brain model row */}
        <div style={styles.topRow}>
          <div style={styles.videoCol}>
            {appState === "upload" && (
              <>
                <VideoUpload embedded onUpload={handleUpload} />
                <ImportSection
                  onImport={handleImportAnalysis}
                  onLoadPreprocessed={handleLoadPreprocessed}
                />
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

      {showResults && (
        <FeedbackPanel
          videoId={videoId}
          section={selectedSection}
          lowSections={analysis.low_engagement_sections}
          onSelectSection={handleSectionClick}
          onClearSection={() => setSelectedSection(null)}
          onSeek={seekTo}
          getFeedbackOverride={demoVideoUrl || isRealAnalysis ? generateMockFeedback : undefined}
        />
      )}
    </div>
  );
}

function ImportSection({
  onImport,
  onLoadPreprocessed,
}: {
  onImport: (videoFile: File, analysisJson: AnalysisResult) => void;
  onLoadPreprocessed: () => void;
}) {
  const videoFileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGo = useCallback(async () => {
    if (!videoFile || !jsonFile) return;
    setError(null);
    try {
      const text = await jsonFile.text();
      const data = JSON.parse(text) as AnalysisResult;
      if (!data.timeline || !data.brain_activations) {
        throw new Error("Invalid analysis JSON — missing timeline or brain_activations");
      }
      onImport(videoFile, data);
    } catch (e: any) {
      setError(e.message || "Failed to parse analysis JSON");
    }
  }, [videoFile, jsonFile, onImport]);

  return (
    <div style={importStyles.container}>
      <div style={importStyles.divider}>
        <span style={importStyles.dividerLine} />
        <span style={importStyles.dividerText}>or load processed analysis</span>
        <span style={importStyles.dividerLine} />
      </div>

      <button type="button" onClick={onLoadPreprocessed} style={importStyles.preloadBtn}>
        Load Pre-processed Demo (TRIBE v2 output)
      </button>

      <p style={importStyles.hint}>
        Or import your own: pick a video file and its processed analysis JSON
        (generated by <code style={{ color: "#c4b5fd" }}>process_analysis.py</code>).
      </p>

      <div style={importStyles.fileRow}>
        <div style={importStyles.filePickWrap}>
          <label style={importStyles.filePick}>
            {videoFile ? `✓ ${videoFile.name.slice(0, 24)}` : "Select Video"}
            <input
              ref={videoFileRef}
              type="file"
              accept="video/*"
              style={{ display: "none" }}
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <span style={{ color: "#444" }}>+</span>
        <div style={importStyles.filePickWrap}>
          <label style={importStyles.filePick}>
            {jsonFile ? `✓ ${jsonFile.name.slice(0, 24)}` : "Select Analysis JSON"}
            <input
              ref={jsonFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!videoFile || !jsonFile}
          onClick={handleGo}
          style={{
            ...importStyles.goBtn,
            opacity: videoFile && jsonFile ? 1 : 0.35,
            cursor: videoFile && jsonFile ? "pointer" : "not-allowed",
          }}
        >
          Go
        </button>
      </div>
      {error && <p style={importStyles.error}>{error}</p>}
    </div>
  );
}

const importStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    marginTop: "1.5rem",
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
  preloadBtn: {
    padding: "0.65rem 1.5rem",
    background: "linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(139, 92, 246, 0.15))",
    border: "1.5px solid rgba(6, 182, 212, 0.5)",
    borderRadius: 8,
    color: "#67e8f9",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  filePickWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
  },
  filePick: {
    padding: "0.5rem 1rem",
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid #444",
    borderRadius: 8,
    color: "#aaa",
    fontSize: "0.82rem",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  goBtn: {
    padding: "0.5rem 1.2rem",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: "0.85rem",
    fontWeight: 600,
    transition: "all 0.15s",
  },
  error: {
    color: "#f87171",
    fontSize: "0.8rem",
    margin: 0,
  },
};

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
    gridTemplateColumns: "1fr 1fr",
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
