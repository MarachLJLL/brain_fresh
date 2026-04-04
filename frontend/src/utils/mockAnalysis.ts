import type {
  AnalysisResult,
  FeedbackResponse,
  LowEngagementSection,
  TranscriptSegment,
} from "../types";

const TRANSCRIPT_SNIPPETS = [
  "We open on the main idea and set up the problem quickly.",
  "This section explains the context behind the workflow.",
  "Here the presenter shifts into the step by step example.",
  "A concrete takeaway lands better when the pacing stays tight.",
  "This is where the audience needs a visual anchor or a clearer hook.",
  "The narration adds detail, but the moment needs stronger emphasis.",
  "A quick reset sentence helps the viewer understand why this matters.",
  "The example becomes more persuasive once the payoff is visible.",
  "This transition works best when the key point is repeated simply.",
  "The audience is likely waiting for the next concrete result here.",
  "Energy improves when the script points back to the original promise.",
  "A short summary line can reconnect the viewer before moving on.",
];

const MODALITY_FEEDBACK: Record<
  string,
  { feedback: string; suggestions: string[] }
> = {
  visual: {
    feedback:
      "The visuals flatten in this stretch, so the viewer is mostly listening without getting a fresh visual cue to reinforce the point.",
    suggestions: [
      "Cut to a new framing, graphic, or screen detail within the first two seconds of the section.",
      "Put the key claim on screen so the audience can process it visually and verbally at the same time.",
      "Trim any static shot that lasts longer than the spoken idea it supports.",
    ],
  },
  text: {
    feedback:
      "The message loses clarity here because the wording becomes less direct, which makes the audience work harder to track the point.",
    suggestions: [
      "Rewrite the first sentence of the section so the core takeaway lands immediately.",
      "Break longer phrasing into one short claim followed by one supporting detail.",
      "Repeat the important noun or phrase instead of switching to vaguer wording mid thought.",
    ],
  },
  audio: {
    feedback:
      "Audio engagement dips here because the delivery and sound texture become more even, so the section feels less dynamic than the surrounding moments.",
    suggestions: [
      "Add a stronger vocal emphasis or pause right before the key line.",
      "Reduce dead air and tighten the gap between sentences in this section.",
      "Layer in a subtle beat change, sound accent, or cleaner mix transition to mark the moment.",
    ],
  },
};

export function generateMockAnalysis(durationSeconds: number): AnalysisResult {
  const duration = Math.max(18, Math.round(durationSeconds || 90));
  const transcriptSegments = buildTranscriptSegments(duration);
  const plannedSections = buildPlannedSections(duration);

  const timeline = Array.from({ length: duration + 1 }, (_, second) => {
    const t = second;
    const waveA = Math.sin(t * 0.14);
    const waveB = Math.cos(t * 0.09 + 0.8);
    const waveC = Math.sin(t * 0.22 + 1.7);

    let visual = 0.62 + waveA * 0.12 + waveB * 0.06;
    let text = 0.58 + waveB * 0.1 + waveC * 0.07;
    let audio = 0.6 + waveC * 0.11 + waveA * 0.05;

    for (const section of plannedSections) {
      const influence = sectionInfluence(t, section.start_time, section.end_time);
      if (influence === 0) continue;

      visual -= influence * (section.modality === "visual" ? 0.42 : 0.14);
      text -= influence * (section.modality === "text" ? 0.42 : 0.14);
      audio -= influence * (section.modality === "audio" ? 0.42 : 0.14);
    }

    return {
      time: t,
      visual: clamp01(visual),
      text: clamp01(text),
      audio: clamp01(audio),
    };
  });

  const lowEngagementSections: LowEngagementSection[] = plannedSections.map((section) => {
    const sectionPoints = timeline.filter(
      (point) => point.time >= section.start_time && point.time <= section.end_time
    );
    const score =
      sectionPoints.reduce(
        (sum, point) => sum + (point.visual + point.text + point.audio) / 3,
        0
      ) / Math.max(1, sectionPoints.length);
    const transcript = transcriptSegments
      .filter(
        (segment) =>
          segment.end >= section.start_time && segment.start <= section.end_time
      )
      .map((segment) => segment.text)
      .join(" ");

    return {
      ...section,
      score,
      transcript,
    };
  });

  const brainActivations = timeline.map((point) => ({
    time: point.time,
    vertices: buildActivationFrame(point.time, point),
  }));

  return {
    video_id: "demo",
    duration,
    timeline,
    brain_activations: brainActivations,
    brain_viewer: {
      mesh: "fsaverage5",
      vertex_count: 384,
      left_hemisphere_vertex_count: 192,
      predicted_available: true,
      true_available: false,
      supports_open_close: true,
      supports_inflation: true,
      signal_lag_seconds: 5,
    },
    low_engagement_sections: lowEngagementSections,
    transcript_segments: transcriptSegments,
  };
}

export async function generateMockFeedback(
  section: LowEngagementSection
): Promise<FeedbackResponse> {
  const copy = MODALITY_FEEDBACK[section.modality] ?? MODALITY_FEEDBACK.audio;
  const transcriptNote = section.transcript
    ? ` The current transcript suggests the idea is present, but the delivery around it needs stronger support.`
    : "";

  await wait(280);

  return {
    section_start: section.start_time,
    section_end: section.end_time,
    feedback: `${copy.feedback}${transcriptNote}`,
    suggestions: copy.suggestions,
  };
}

function buildTranscriptSegments(duration: number): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const windowSize = 5;
  const totalSegments = Math.max(1, Math.ceil(duration / windowSize));

  for (let index = 0; index < totalSegments; index += 1) {
    const start = index * windowSize;
    const end = Math.min(duration, start + windowSize);
    const sentenceA = TRANSCRIPT_SNIPPETS[index % TRANSCRIPT_SNIPPETS.length];
    const sentenceB =
      TRANSCRIPT_SNIPPETS[(index + 4) % TRANSCRIPT_SNIPPETS.length];

    segments.push({
      start,
      end,
      text: `${sentenceA} ${sentenceB}`,
    });
  }

  return segments;
}

function buildPlannedSections(duration: number): LowEngagementSection[] {
  const length = Math.max(4, Math.min(8, Math.round(duration * 0.08)));
  const sections = [
    { fraction: 0.2, modality: "visual" },
    { fraction: 0.46, modality: "text" },
    { fraction: 0.73, modality: "audio" },
  ];

  return sections
    .filter((section) => duration * section.fraction < duration - 3)
    .map((section) => {
      const start = clampNumber(
        Math.round(duration * section.fraction),
        2,
        Math.max(2, duration - length - 1)
      );
      const end = Math.min(duration, start + length);

      return {
        start_time: start,
        end_time: end,
        modality: section.modality,
        score: 0,
        transcript: "",
      };
    });
}

function buildActivationFrame(
  time: number,
  point: { visual: number; text: number; audio: number }
): number[] {
  const combined = (point.visual + point.text + point.audio) / 3;

  return Array.from({ length: 384 }, (_, index) => {
    const phase = index * 0.071;
    const band = Math.sin(phase + time * 0.13) * 0.5;
    const ripple = Math.cos(index * 0.019 - time * 0.08) * 0.3;
    const modulation =
      (point.visual - 0.5) * Math.sin(index * 0.11) +
      (point.text - 0.5) * Math.cos(index * 0.07) +
      (point.audio - 0.5) * Math.sin(index * 0.05 + 1.1);

    return clampSigned(band + ripple + modulation * 0.6 + (combined - 0.5) * 0.5);
  });
}

function sectionInfluence(time: number, start: number, end: number): number {
  if (time < start || time > end) return 0;

  const midpoint = (start + end) / 2;
  const radius = Math.max(1, (end - start) / 2);
  const distance = Math.abs(time - midpoint) / radius;
  return Math.max(0, 1 - distance);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clamp01(value: number): number {
  return clampNumber(value, 0.04, 0.98);
}

function clampSigned(value: number): number {
  return clampNumber(value, -1, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
