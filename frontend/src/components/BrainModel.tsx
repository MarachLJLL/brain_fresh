import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
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

interface ModalityMapData {
  visual: number[];
  audio: number[];
  text: number[];
}

type Modality = "visual" | "text" | "audio" | null;

interface ModalityDrives {
  visual: number;
  audio: number;
  text: number;
}

interface Props {
  activations: BrainActivation[];
  currentTime: number;
  /** When provided, brain regions auto-glow proportionally (from timeline data). */
  timelineDrives?: ModalityDrives;
}

const MODALITIES: { key: Modality & string; label: string; hint: string; color: string }[] = [
  { key: "visual", label: "Visual", hint: "Occipital / parietal cortex", color: "#ff2020" },
  { key: "audio", label: "Audio", hint: "Temporal / insular cortex", color: "#00ee44" },
  { key: "text", label: "Text", hint: "Frontal / language network", color: "#2266ff" },
];

export default function BrainModel({ activations, currentTime, timelineDrives }: Props) {
  const [active, setActive] = useState<Modality>(null);
  const [locked, setLocked] = useState(false);

  const handleClick = (m: Modality & string) => {
    if (locked && active === m) {
      setLocked(false);
      setActive(null);
    } else {
      setLocked(true);
      setActive(m);
    }
  };

  const handleHover = (m: Modality & string) => {
    if (!locked) setActive(m);
  };

  const handleLeave = () => {
    if (!locked) setActive(null);
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Brain Activation</h3>
      <div style={styles.buttonRow}>
        {MODALITIES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => handleClick(m.key)}
            onMouseEnter={() => handleHover(m.key)}
            onMouseLeave={handleLeave}
            style={{
              ...styles.modButton,
              borderColor: active === m.key ? m.color : "#333",
              background: active === m.key ? `${m.color}18` : "rgba(255,255,255,0.03)",
              boxShadow: active === m.key ? `0 0 12px ${m.color}44` : "none",
            }}
          >
            <span style={{ ...styles.modDot, background: m.color }} />
            <span style={{
              ...styles.modLabel,
              color: active === m.key ? m.color : "#999",
            }}>
              {m.label}
            </span>
            <span style={styles.modHint}>{m.hint}</span>
          </button>
        ))}
      </div>
      <div style={styles.canvasWrap}>
        <Canvas
          camera={{ position: [0, 0.1, 4.0], fov: 42 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#06060c"]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[6, 5, 7]} intensity={1.1} />
          <directionalLight position={[-5, 3, -4]} intensity={0.55} />
          <directionalLight position={[0, -6, 2]} intensity={0.2} />
          <pointLight position={[0, 2.2, 3.2]} intensity={0.3} distance={8} decay={2} />
          <Environment preset="studio" environmentIntensity={0.5} />
          <CorticalBrain
            activations={activations}
            currentTime={currentTime}
            active={active}
            timelineDrives={timelineDrives}
          />
          <OrbitControls
            enableZoom
            enablePan={false}
            autoRotate={false}
            minDistance={1.35}
            maxDistance={4.5}
            target={[0, 0.05, 0]}
          />
        </Canvas>
      </div>
      {locked && (
        <p style={styles.lockHint}>Click again to deselect</p>
      )}
    </div>
  );
}

function useBrainGeometry(
  meshData: BrainMeshData | null,
  modalityMap: ModalityMapData | null
) {
  return useMemo(() => {
    if (!meshData || !modalityMap) return null;
    const { vertices, indices, vertexCount } = meshData;

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(vertices);
    const idxArr = new Uint32Array(indices);
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
    geo.computeVertexNormals();

    const colors = new Float32Array(vertexCount * 3);
    colors.fill(0.55);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const visualMask = new Float32Array(modalityMap.visual);
    const audioMask = new Float32Array(modalityMap.audio);
    const textMask = new Float32Array(modalityMap.text);

    // Build vertex adjacency from face indices for color diffusion
    const adjSets: Set<number>[] = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) adjSets[i] = new Set();
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f], b = indices[f + 1], c = indices[f + 2];
      adjSets[a].add(b); adjSets[a].add(c);
      adjSets[b].add(a); adjSets[b].add(c);
      adjSets[c].add(a); adjSets[c].add(b);
    }
    const adjacency = adjSets.map(s => Array.from(s));

    return { geometry: geo, colors, visualMask, audioMask, textMask, adjacency };
  }, [meshData, modalityMap]);
}

function CorticalBrain({
  activations, currentTime, active, timelineDrives,
}: {
  activations: BrainActivation[]; currentTime: number;
  active: Modality;
  timelineDrives?: ModalityDrives;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const rawMesh = useLoader(FileLoader, "/brain-mesh.json");
  const rawMap = useLoader(FileLoader, "/brain-modality-map.json");

  const meshData: BrainMeshData | null = useMemo(() => {
    if (!rawMesh) return null;
    return JSON.parse(rawMesh as string) as BrainMeshData;
  }, [rawMesh]);

  const modalityMap: ModalityMapData | null = useMemo(() => {
    if (!rawMap) return null;
    return JSON.parse(rawMap as string) as ModalityMapData;
  }, [rawMap]);

  const brainGeo = useBrainGeometry(meshData, modalityMap);

  useEffect(() => {
    if (!brainGeo) return;
    const { colors, geometry, visualMask, audioMask, textMask, adjacency } = brainGeo;
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

    const hasManual = active !== null;
    const drives = timelineDrives ?? { visual: 0, audio: 0, text: 0 };
    const hasDrives = !hasManual && (drives.visual + drives.audio + drives.text) > 0.01;

    const ACT_THRESHOLD = 0.5;
    const ACT_RANGE = 1.0 - ACT_THRESHOLD;
    const MANUAL_STRENGTH = 4.0;
    const AUTO_STRENGTH = 5.0;
    const BASE_DIM = 0.10;
    const CONTRAST = 2.0;

    // Read vertex positions for spatial noise
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;

    for (let i = 0; i < n; i++) {
      // --- Interpolated activation from sparse vertex array ---
      let rawAct = 0;
      if (verts && nAct > 0) {
        const t = ((i + 0.5) / n) * nAct - 0.5;
        const lo = Math.max(0, Math.floor(t));
        const hi = Math.min(nAct - 1, lo + 1);
        const frac = t - lo;
        rawAct = verts[lo] * (1 - frac) + verts[hi] * frac;
      }

      // Per-vertex spatial noise from 3D position (deterministic hash).
      // This breaks up the uniform patches so adjacent vertices differ.
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      const h1 = Math.sin(px * 73.17 + py * 119.43 + pz * 157.29) * 43758.5453;
      const noise = (h1 - Math.floor(h1)) * 2 - 1; // [-1, 1]
      rawAct += noise * 0.12;

      const isActive = rawAct > ACT_THRESHOLD;
      // Apply contrast curve to spread brightness values
      const voxelBright = isActive
        ? Math.pow(Math.max(0, (rawAct - ACT_THRESHOLD) / ACT_RANGE), 1 / CONTRAST)
        : 0;

      const isVis = visualMask[i] > 0.5;
      const isAud = audioMask[i] > 0.5;
      const isTxt = textMask[i] > 0.5;
      const inRegion = isVis || isAud || isTxt;

      let r = 0, g = 0, b = 0;

      if (hasManual) {
        const show = (active === "visual" && isVis)
                  || (active === "audio" && isAud)
                  || (active === "text" && isTxt);
        if (show && isActive) {
          const intensity = voxelBright * MANUAL_STRENGTH;
          if (active === "visual") r = intensity;
          else if (active === "audio") g = intensity;
          else b = intensity;
          const sat = Math.min(1, intensity * 0.5);
          const gray = (1 - sat) * BASE_DIM;
          r += gray; g += gray; b += gray;
        } else {
          r = g = b = BASE_DIM;
        }
      } else if (hasDrives && inRegion && isActive) {
        const GAMMA = 1.4;
        const visGlow = isVis ? voxelBright * Math.pow(Math.max(0, drives.visual), GAMMA) * AUTO_STRENGTH : 0;
        const audGlow = isAud ? voxelBright * Math.pow(Math.max(0, drives.audio), GAMMA) * AUTO_STRENGTH : 0;
        const txtGlow = isTxt ? voxelBright * Math.pow(Math.max(0, drives.text), GAMMA) * AUTO_STRENGTH : 0;
        const totalGlow = visGlow + audGlow + txtGlow;

        const sat = Math.min(1, totalGlow * 0.5);
        const gray = (1 - sat) * 0.15;
        r = gray + visGlow;
        g = gray + audGlow;
        b = gray + txtGlow;
      } else {
        r = g = b = hasDrives ? BASE_DIM : 0.45;
      }

      colors[i * 3]     = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    // Diffusion passes: bright voxels bleed color into neighbors along the
    // mesh surface, creating soft halos around activation hot spots.
    const DIFFUSION_PASSES = 4;
    const DIFFUSION_PULL = 0.3;
    for (let pass = 0; pass < DIFFUSION_PASSES; pass++) {
      const prev = new Float32Array(colors);
      for (let i = 0; i < n; i++) {
        const nb = adjacency[i];
        if (!nb.length) continue;
        // Find the brightest neighbor per channel
        let maxR = 0, maxG = 0, maxB = 0;
        for (let k = 0; k < nb.length; k++) {
          const ni = nb[k];
          const nr = prev[ni * 3], ng = prev[ni * 3 + 1], nb2 = prev[ni * 3 + 2];
          if (nr > maxR) maxR = nr;
          if (ng > maxG) maxG = ng;
          if (nb2 > maxB) maxB = nb2;
        }
        // Pull this vertex toward its brightest neighbor (only brightens, never dims)
        const cr = prev[i * 3], cg = prev[i * 3 + 1], cb = prev[i * 3 + 2];
        if (maxR > cr) colors[i * 3]     = cr + (maxR - cr) * DIFFUSION_PULL;
        if (maxG > cg) colors[i * 3 + 1] = cg + (maxG - cg) * DIFFUSION_PULL;
        if (maxB > cb) colors[i * 3 + 2] = cb + (maxB - cb) * DIFFUSION_PULL;
      }
    }

    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }, [brainGeo, activations, currentTime, active, timelineDrives]);

  // No auto-rotation — user drags to rotate via OrbitControls

  if (!brainGeo) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={meshRef} geometry={brainGeo.geometry} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={(active || timelineDrives) ? 0.22 : 0.42}
          metalness={0.04}
          envMapIntensity={(active || timelineDrives) ? 1.1 : 0.8}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
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
  buttonRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  modButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.55rem 0.4rem",
    border: "1.5px solid #333",
    borderRadius: 10,
    cursor: "pointer",
    transition: "all 0.15s ease",
    minWidth: 0,
  },
  modDot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  modLabel: {
    fontSize: "0.78rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  modHint: {
    fontSize: "0.6rem",
    color: "#555",
    lineHeight: 1.2,
  },
  canvasWrap: {
    width: "100%",
    height: 420,
    borderRadius: 8,
    overflow: "hidden",
  },
  lockHint: {
    fontSize: "0.65rem",
    color: "#555",
    textAlign: "center",
    marginTop: "0.45rem",
  },
};
