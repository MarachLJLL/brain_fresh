import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { BrainActivation } from "../types";
import { FileLoader } from "three";

interface BrainMeshData {
  vertices: number[];
  indices: number[];
  lhCount: number;
  vertexCount: number;
  faceCount: number;
}

interface Props {
  activations: BrainActivation[];
  currentTime: number;
}

export default function BrainModel({ activations, currentTime }: Props) {
  const [visual, setVisual] = useState(0);
  const [text, setText] = useState(0);
  const [audio, setAudio] = useState(0);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Brain Activation</h3>
      <div style={styles.sliderPanel}>
        <ModalitySlider
          label="Visual"
          hint="Occipital / visual cortex"
          value={visual}
          onChange={setVisual}
          accent="#22d3ee"
        />
        <ModalitySlider
          label="Text"
          hint="Language network (left-dominant)"
          value={text}
          onChange={setText}
          accent="#c084fc"
        />
        <ModalitySlider
          label="Audio"
          hint="Auditory cortex (temporal)"
          value={audio}
          onChange={setAudio}
          accent="#fb923c"
        />
      </div>
      <div style={styles.canvasWrap}>
        <Canvas
          camera={{ position: [0, 0.15, 2.2], fov: 42 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
        >
          <color attach="background" args={["#06060c"]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[6, 5, 7]} intensity={1.1} />
          <directionalLight position={[-5, 3, -4]} intensity={0.55} />
          <directionalLight position={[0, -6, 2]} intensity={0.2} />
          <pointLight position={[0, 2.2, 3.2]} intensity={0.3} distance={8} decay={2} />
          <Environment preset="studio" environmentIntensity={0.5} />
          <HeadSilhouette />
          <CorticalBrain
            activations={activations}
            currentTime={currentTime}
            visual={visual}
            text={text}
            audio={audio}
          />
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            autoRotate={true}
            autoRotateSpeed={0.45}
            minDistance={1.35}
            maxDistance={4.5}
            target={[0, 0.05, 0]}
          />
        </Canvas>
      </div>
      <div style={styles.legend}>
        <span style={{ color: "#ef4444" }}>Video</span>
        <span style={{ color: "#888", margin: "0 0.2rem" }}>·</span>
        <span style={{ color: "#22c55e" }}>Audio</span>
        <span style={{ color: "#888", margin: "0 0.2rem" }}>·</span>
        <span style={{ color: "#3b82f6" }}>Text</span>
        <span style={{ color: "#555", margin: "0 0.5rem" }}>|</span>
        <span style={{ color: "#ccc", fontSize: "0.65rem" }}>Colors blend additively like the TRIBE v2 demo</span>
      </div>
    </div>
  );
}

function ModalitySlider({
  label,
  hint,
  value,
  onChange,
  accent,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <label style={styles.sliderLabel}>
      <div style={styles.sliderLabelRow}>
        <span style={{ ...styles.sliderTitle, color: accent }}>{label}</span>
        <span style={styles.sliderPct}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ ...styles.range, accentColor: accent } as React.CSSProperties}
        aria-label={`${label} input drive`}
      />
      <span style={styles.sliderHint}>{hint}</span>
    </label>
  );
}

function HeadSilhouette() {
  return (
    <mesh scale={1.28} renderOrder={-1}>
      <sphereGeometry args={[1, 48, 32]} />
      <meshBasicMaterial
        color="#4c4c68"
        wireframe
        transparent
        opacity={0.055}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Build a BufferGeometry from the fsaverage5 mesh JSON.
 * Computes per-vertex region masks at construction time so
 * the coloring loop only does cheap lookups.
 */
function useBrainGeometry(meshData: BrainMeshData | null) {
  return useMemo(() => {
    if (!meshData) return null;

    const { vertices, indices, lhCount, vertexCount } = meshData;

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(vertices);
    const idxArr = new Uint32Array(indices);

    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
    geo.computeVertexNormals();

    const colors = new Float32Array(vertexCount * 3);
    colors.fill(0.55);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Pre-compute region masks using fsaverage5 vertex anatomy.
    // LH = indices 0..lhCount-1, RH = lhCount..vertexCount-1.
    // Regions are derived from the vertex normal direction (outward from centroid).
    const visualMask = new Float32Array(vertexCount);
    const audioMask = new Float32Array(vertexCount);
    const textMask = new Float32Array(vertexCount);

    const normals = geo.attributes.normal as THREE.BufferAttribute;

    for (let i = 0; i < vertexCount; i++) {
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);
      const px = posArr[i * 3];
      const py = posArr[i * 3 + 1];
      const pz = posArr[i * 3 + 2];

      const isLeft = i < lhCount;

      // Visual cortex: occipital pole = posterior vertices.
      // In fsaverage5 after centering, posterior is typically -Y direction.
      // Use a combination of position and normal for a tight mask.
      const posteriorness = -py;
      visualMask[i] = Math.max(0, gaussLobe(posteriorness, 0.55, 3.5));

      // Auditory cortex: superior temporal, lateral.
      // Lateral = large |px|, roughly at ear-level height, mid-anteroposterior.
      const lateralness = Math.abs(px);
      const midHeight = 1 - Math.abs(pz - 0.05) * 3;
      audioMask[i] = Math.max(
        0,
        gaussLobe(lateralness, 0.72, 6) *
          Math.max(0, midHeight) *
          gaussLobe(-py, -0.1, 1.5)
      );

      // Language: left perisylvian (Broca's + Wernicke's + angular gyrus).
      // Only left hemisphere.
      if (isLeft) {
        // Broca's: left inferior frontal (anterior + lateral + slightly inferior)
        const brocaD = dist3(px, py, pz, -0.55, 0.45, 0.25);
        const broca = gaussDist(brocaD, 4.5);

        // Wernicke's: left posterior superior temporal
        const wernickeD = dist3(px, py, pz, -0.65, -0.25, 0.1);
        const wernicke = gaussDist(wernickeD, 4.5);

        // Angular gyrus: left inferior parietal
        const angularD = dist3(px, py, pz, -0.48, -0.35, 0.40);
        const angular = gaussDist(angularD, 5.0);

        textMask[i] = Math.max(broca, wernicke, angular);
      }
    }

    return { geometry: geo, colors, visualMask, audioMask, textMask };
  }, [meshData]);
}

function gaussLobe(x: number, center: number, sharpness: number): number {
  const d = x - center;
  return Math.exp(-sharpness * d * d);
}

function dist3(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function gaussDist(d: number, sharpness: number): number {
  return Math.exp(-sharpness * d * d);
}

function CorticalBrain({
  activations,
  currentTime,
  visual,
  text,
  audio,
}: {
  activations: BrainActivation[];
  currentTime: number;
  visual: number;
  text: number;
  audio: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const raw = useLoader(FileLoader, "/brain-mesh.json");
  const meshData: BrainMeshData | null = useMemo(() => {
    if (!raw) return null;
    return JSON.parse(raw as string) as BrainMeshData;
  }, [raw]);

  const brainGeo = useBrainGeometry(meshData);

  useEffect(() => {
    if (!brainGeo) return;
    const { colors, geometry, visualMask, audioMask, textMask } = brainGeo;
    const n = colors.length / 3;

    let closest: BrainActivation | null = null;
    let minDist = Infinity;
    if (activations.length) {
      for (const a of activations) {
        const d = Math.abs(a.time - currentTime);
        if (d < minDist) { minDist = d; closest = a; }
      }
    }

    const verts = closest?.vertices;
    const nAct = verts?.length ?? 0;

    for (let i = 0; i < n; i++) {
      // Base gray
      let r = 0.55, g = 0.55, b = 0.55;

      // If we have TRIBE activation data, use it as an overall intensity overlay.
      if (verts && nAct > 0) {
        const ai = Math.min(nAct - 1, Math.floor(((i + 0.5) / n) * nAct));
        const raw = (verts[ai] + 1) / 2;
        const v = Math.max(0, Math.min(1, raw));
        // map activation to brightness modulation
        const brightness = 0.35 + v * 0.65;
        r *= brightness;
        g *= brightness;
        b *= brightness;
      }

      // Additive modality glow: Video=R, Audio=G, Text=B (same as TRIBE demo)
      const strength = 2.0;
      const rv = visualMask[i] * visual * strength;
      const ra = audioMask[i] * audio * strength;
      const rt = textMask[i] * text * strength;

      r += rv;
      g += ra;
      b += rt;

      colors[i * 3] = Math.min(2.5, r);
      colors[i * 3 + 1] = Math.min(2.5, g);
      colors[i * 3 + 2] = Math.min(2.5, b);
    }

    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }, [brainGeo, activations, currentTime, visual, text, audio]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 0.04;
    }
  });

  if (!brainGeo) return null;

  const anyGlow = visual + text + audio > 0.02;

  return (
    <mesh ref={meshRef} geometry={brainGeo.geometry} castShadow receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={anyGlow ? 0.3 : 0.42}
        metalness={0.05}
        envMapIntensity={anyGlow ? 1.0 : 0.8}
        side={THREE.DoubleSide}
        toneMapped={true}
      />
    </mesh>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #222",
    borderRadius: 12,
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
  title: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#ccc",
    marginBottom: "0.65rem",
  },
  sliderPanel: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "0.75rem 1rem",
    marginBottom: "0.85rem",
  },
  sliderLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    cursor: "pointer",
    minWidth: 0,
  },
  sliderLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sliderTitle: {
    fontSize: "0.78rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  sliderPct: {
    fontSize: "0.72rem",
    color: "#666",
    fontVariantNumeric: "tabular-nums",
  },
  range: {
    width: "100%",
    height: 6,
    cursor: "pointer",
  },
  sliderHint: {
    fontSize: "0.65rem",
    color: "#555",
    lineHeight: 1.25,
  },
  canvasWrap: {
    width: "100%",
    height: 420,
    borderRadius: 8,
    overflow: "hidden",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.35rem",
    marginTop: "0.65rem",
    fontSize: "0.72rem",
  },
};
