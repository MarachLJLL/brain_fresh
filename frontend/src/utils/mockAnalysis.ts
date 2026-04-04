import type {
  AnalysisResult,
  TimelinePoint,
  BrainActivation,
  FeedbackResponse,
  LowEngagementSection,
  TranscriptSegment,
} from "../types";

function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Keyframe {
  frac: number;
  visual: number;
  audio: number;
  text: number;
}

// Engagement profile: speaker intro → visual diagrams → verbal explanation
// → low-engagement dip → exciting demo → closing
const KEYFRAMES: Keyframe[] = [
  { frac: 0.0,  visual: 0.72, audio: 0.68, text: 0.30 },
  { frac: 0.14, visual: 0.75, audio: 0.65, text: 0.32 },
  { frac: 0.18, visual: 0.88, audio: 0.25, text: 0.50 },
  { frac: 0.34, visual: 0.85, audio: 0.30, text: 0.48 },
  { frac: 0.38, visual: 0.42, audio: 0.78, text: 0.82 },
  { frac: 0.49, visual: 0.40, audio: 0.80, text: 0.80 },
  { frac: 0.53, visual: 0.18, audio: 0.22, text: 0.15 },
  { frac: 0.63, visual: 0.20, audio: 0.20, text: 0.18 },
  { frac: 0.68, visual: 0.82, audio: 0.75, text: 0.55 },
  { frac: 0.81, visual: 0.80, audio: 0.72, text: 0.58 },
  { frac: 0.88, visual: 0.55, audio: 0.60, text: 0.45 },
  { frac: 1.0,  visual: 0.42, audio: 0.48, text: 0.32 },
];

function sampleKeyframes(frac: number): { visual: number; audio: number; text: number } {
  const f = Math.max(0, Math.min(1, frac));
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const lo = KEYFRAMES[i];
    const hi = KEYFRAMES[i + 1];
    if (f >= lo.frac && f <= hi.frac) {
      const t = lo.frac === hi.frac ? 0 : (f - lo.frac) / (hi.frac - lo.frac);
      const s = smoothstep(0, 1, t);
      return {
        visual: lerp(lo.visual, hi.visual, s),
        audio: lerp(lo.audio, hi.audio, s),
        text: lerp(lo.text, hi.text, s),
      };
    }
  }
  const last = KEYFRAMES[KEYFRAMES.length - 1];
  return { visual: last.visual, audio: last.audio, text: last.text };
}

const TRANSCRIPT_LINES = [
  "Welcome everyone. Today we're going to dive into how neural networks process and understand visual information from video content.",
  "The visual cortex, located in the occipital lobe, is our brain's primary processing center for images, motion, and spatial relationships.",
  "When we watch a video, millions of neurons fire in coordinated patterns. Let me show you some of the key visualizations.",
  "As you can see in this diagram, the visual processing pipeline starts with edge detection, then moves to more complex feature recognition.",
  "The hierarchy of visual processing areas builds increasingly abstract representations of what we're seeing.",
  "Now the interesting part is how these visual signals integrate with language processing in real time.",
  "When you see text on screen, your brain simultaneously activates both visual and language networks.",
  "The superior temporal gyrus processes auditory information, while Broca's area handles linguistic comprehension.",
  "These regions work together seamlessly in what neuroscientists call multi-modal integration.",
  "Um, so this slide shows some additional technical specifications for the model architecture.",
  "The parameters are listed here if you want to review them later. Moving on...",
  "Let me show you something really exciting. This is a live demonstration of our brain encoding model in action.",
  "Watch how the activation patterns shift as the video content changes dynamically.",
  "Notice the strong visual response here, and now the auditory cortex is lighting up as well.",
  "The key insight is that engagement comes from activating multiple brain regions simultaneously.",
  "The most compelling content creates a rich, multi-modal experience for the viewer.",
  "Thank you for watching. I hope this gave you a better understanding of how our brains process multimedia content.",
  "Feel free to reach out with any questions. Have a great day everyone.",
];

export function generateMockAnalysis(duration: number = 90): AnalysisResult {
  const rng = seededRandom(42);

  // --- Timeline: one point every 0.5 s ---
  const timeline: TimelinePoint[] = [];
  for (let t = 0; t <= duration; t += 0.5) {
    const base = sampleKeyframes(t / duration);
    timeline.push({
      time: Math.round(t * 100) / 100,
      visual: clamp01(base.visual + (rng() - 0.5) * 0.08),
      audio: clamp01(base.audio + (rng() - 0.5) * 0.08),
      text: clamp01(base.text + (rng() - 0.5) * 0.08),
    });
  }

  // --- Brain activations: one frame per second, 2048 vertices each ---
  const VERTS = 2048;
  const brainActivations: BrainActivation[] = [];
  for (let t = 0; t <= duration; t += 1) {
    const base = sampleKeyframes(t / duration);
    const engagement = (base.visual + base.audio + base.text) / 3;
    const vertices: number[] = new Array(VERTS);

    for (let i = 0; i < VERTS; i++) {
      const sp = i / VERTS; // 0..1 spatial position along vertices
      // Traveling waves at different spatial frequencies
      const wave1 = Math.sin(sp * Math.PI * 8 + t * 0.3) * 0.25;
      const wave2 = Math.cos(sp * Math.PI * 3.7 + t * 0.7) * 0.15;
      const wave3 = Math.sin(sp * Math.PI * 14 + t * 1.1) * 0.08;

      // Spatially-biased modality activation: early vertices ≈ visual,
      // mid vertices ≈ auditory, late vertices ≈ text/language
      const vBias = gaussBump(sp, 0.15, 8) * base.visual * 0.35;
      const aBias = gaussBump(sp, 0.45, 6) * base.audio * 0.30;
      const tBias = gaussBump(sp, 0.75, 5) * base.text * 0.30;

      const baseVal = engagement * 0.35 - 0.15;
      const noise = (rng() - 0.5) * 0.18;
      const val = baseVal + wave1 + wave2 + wave3 + vBias + aBias + tBias + noise;
      vertices[i] = Math.round(clampN1P1(val) * 100) / 100;
    }

    brainActivations.push({ time: t, vertices });
  }

  // --- Low-engagement sections ---
  const lowSections: LowEngagementSection[] = [
    {
      start_time: Math.round(duration * 0.52),
      end_time: Math.round(duration * 0.63),
      modality: "visual",
      score: 0.18,
      transcript:
        "Um, so this slide shows some additional technical specifications and parameters for the model architecture. The full details are in the appendix.",
    },
    {
      start_time: Math.round(duration * 0.88),
      end_time: Math.round(duration * 0.94),
      modality: "audio",
      score: 0.28,
      transcript:
        "And that basically wraps up the main points. We've covered quite a bit today.",
    },
  ];

  // --- Transcript segments (evenly spaced) ---
  const segDur = duration / TRANSCRIPT_LINES.length;
  const transcriptSegments: TranscriptSegment[] = TRANSCRIPT_LINES.map(
    (text, i) => ({
      start: round2(i * segDur),
      end: round2((i + 1) * segDur),
      text,
    })
  );

  return {
    video_id: "demo",
    duration,
    timeline,
    brain_activations: brainActivations,
    low_engagement_sections: lowSections,
    transcript_segments: transcriptSegments,
  };
}

const MOCK_FEEDBACK: Record<string, { feedback: string; suggestions: string[] }> = {
  visual: {
    feedback:
      "This section shows significantly reduced visual engagement. The visual content appears static with minimal motion or visual variety, causing viewer attention to drop. The brain's occipital cortex shows low activation during this period, indicating the visual stimuli are not compelling enough to sustain interest.",
    suggestions: [
      "Add dynamic visual elements like transitions, animations, or camera movement to maintain visual interest.",
      "Break up static content (like text-heavy slides) with supporting imagery, diagrams, or video clips.",
      "Use visual hierarchy and contrast to guide the viewer's eye through the content.",
      "Consider picture-in-picture or split-screen layouts to increase visual complexity.",
    ],
  },
  audio: {
    feedback:
      "Auditory engagement drops noticeably here. The temporal cortex shows reduced activation, suggesting the audio content lacks variation in tone, pace, or emphasis. This creates a monotonous listening experience that lets the audience disengage.",
    suggestions: [
      "Vary vocal tone and pacing — use emphasis on key points and strategic pauses for impact.",
      "Add background music or sound effects to create audio texture and emotional cues.",
      "Include audio transitions between sections to re-engage the listener.",
      "Consider adding a second voice or short sound bites to break up monotony.",
    ],
  },
  text: {
    feedback:
      "Language-processing regions show low activation during this segment. The content may be overly technical, repetitive, or lacking narrative structure, reducing cognitive engagement with the material being presented.",
    suggestions: [
      "Simplify complex explanations — use analogies, metaphors, or real-world examples.",
      "Add rhetorical questions or direct audience engagement to activate language processing.",
      "Structure the narrative with clear signposting: preview what's coming, summarize what was said.",
      "Replace jargon-heavy passages with conversational language that's easier to process.",
    ],
  },
};

export async function generateMockFeedback(
  section: LowEngagementSection
): Promise<FeedbackResponse> {
  await new Promise((r) => setTimeout(r, 600));
  const data = MOCK_FEEDBACK[section.modality] ?? MOCK_FEEDBACK.visual;
  return {
    section_start: section.start_time,
    section_end: section.end_time,
    feedback: `${data.feedback} (Score: ${Math.round(section.score * 100)}%)`,
    suggestions: data.suggestions,
  };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
function clampN1P1(v: number) {
  return Math.max(-1, Math.min(1, v));
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
function gaussBump(x: number, center: number, sharpness: number) {
  const d = x - center;
  return Math.exp(-sharpness * d * d);
}
