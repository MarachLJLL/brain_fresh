import { useCallback, useEffect, useState } from "react";

export function useVideoSync() {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  // Callback ref: React calls this when the <video> mounts/unmounts,
  // which triggers the effect below to attach/detach listeners.
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    setVideoEl(node);
  }, []);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!videoEl) return;

    const onTimeUpdate = () => setCurrentTime(videoEl.currentTime);
    const onDuration = () => {
      if (videoEl.duration && isFinite(videoEl.duration)) {
        setDuration(videoEl.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    videoEl.addEventListener("timeupdate", onTimeUpdate);
    videoEl.addEventListener("durationchange", onDuration);
    videoEl.addEventListener("loadedmetadata", onDuration);
    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);

    // Sync initial values if media is already loaded
    if (videoEl.duration && isFinite(videoEl.duration)) {
      setDuration(videoEl.duration);
    }
    setCurrentTime(videoEl.currentTime);
    setIsPlaying(!videoEl.paused);

    return () => {
      videoEl.removeEventListener("timeupdate", onTimeUpdate);
      videoEl.removeEventListener("durationchange", onDuration);
      videoEl.removeEventListener("loadedmetadata", onDuration);
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
    };
  }, [videoEl]);

  const seekTo = useCallback(
    (time: number) => {
      if (videoEl) videoEl.currentTime = time;
    },
    [videoEl]
  );

  const togglePlay = useCallback(() => {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
  }, [videoEl]);

  return { videoRef, currentTime, duration, isPlaying, seekTo, togglePlay };
}
