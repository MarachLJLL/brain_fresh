import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { BrainActivation } from "../types";

type LayoutMode = "closed" | "open";
type Modality = "visual" | "text" | "audio" | null;

interface ModalityDrives {
  visual: number;
  audio: number;
  text: number;
}

interface LegacyMeshData {
  vertices: number[];
  indices: number[];
  lhCount: number;
  vertexCount: number;
}

interface SurfaceAssetData {
  vertexCount: number;
  lhCount: number;
  indices: number[];
  pialVertices: number[];
}

interface ModalityMapData {
  visual: number[];
  audio: number[];
  text: number[];
}

interface BrainGeometryData {
  left: HemisphereGeometryData;
  right: HemisphereGeometryData;
}

interface HemisphereGeometryData {
  geometry: THREE.BufferGeometry;
  positionAttr: THREE.BufferAttribute;
  colorAttr: THREE.BufferAttribute;
  pialPositions: Float32Array;
  vertexStart: number;
  vertexCount: number;
  totalVertexCount: number;
  adjacency: number[][];
}

interface Props {
  activations: BrainActivation[];
  currentTime: number;
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("closed");
  const [surfaceAsset, setSurfaceAsset] = useState<SurfaceAssetData | null>(null);
  const [modalityMap, setModalityMap] = useState<ModalityMapData | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const deferredTime = useDeferredValue(currentTime);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [asset, modMap] = await Promise.all([
          loadSurfaceAsset(),
          loadModalityMap(),
        ]);
        if (!cancelled) {
          setSurfaceAsset(asset);
          setModalityMap(modMap);
          setAssetError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setAssetError(
            error instanceof Error ? error.message : "Failed to load brain surface."
          );
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

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
        {!surfaceAsset && !assetError && (
          <div style={styles.statusCard}>Loading cortical surface...</div>
        )}
        {assetError && <div style={styles.statusCard}>{assetError}</div>}
        {surfaceAsset && (
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
            <CorticalSurface
              asset={surfaceAsset}
              modalityMap={modalityMap}
              activations={activations}
              currentTime={deferredTime}
              layoutMode={layoutMode}
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
        )}
      </div>
      <div style={styles.bottomControls}>
        <SegmentedControl
          options={[
            { key: "open", label: "Open" },
            { key: "closed", label: "Close" },
          ]}
          value={layoutMode}
          onChange={(v) => setLayoutMode(v as LayoutMode)}
        />
      </div>
      {locked && <p style={styles.lockHint}>Click again to deselect</p>}
    </div>
  );
}

function CorticalSurface({
  asset,
  modalityMap,
  activations,
  currentTime,
  layoutMode,
  active,
  timelineDrives,
}: {
  asset: SurfaceAssetData;
  modalityMap: ModalityMapData | null;
  activations: BrainActivation[];
  currentTime: number;
  layoutMode: LayoutMode;
  active: Modality;
  timelineDrives?: ModalityDrives;
}) {
  const data = useMemo(() => buildGeometryData(asset), [asset]);
  const frame = useMemo(
    () => findClosestActivation(activations, currentTime),
    [activations, currentTime]
  );

  useEffect(() => {
    applyModalityColors(data.left, frame, modalityMap, active, timelineDrives);
    applyModalityColors(data.right, frame, modalityMap, active, timelineDrives);
  }, [data, frame, modalityMap, active, timelineDrives]);

  const leftOffset: [number, number, number] =
    layoutMode === "open" ? [-0.9, 0, 0] : [0, 0, 0];
  const rightOffset: [number, number, number] =
    layoutMode === "open" ? [0.9, 0, 0] : [0, 0, 0];
  const leftRotation: [number, number, number] =
    layoutMode === "open" ? [0, 0, -Math.PI / 2] : [0, 0, 0];
  const rightRotation: [number, number, number] =
    layoutMode === "open" ? [0, 0, Math.PI / 2] : [0, 0, 0];
  const brainRotation: [number, number, number] = [-Math.PI / 2, 0, 0];

  const matProps = {
    vertexColors: true as const,
    roughness: active || timelineDrives ? 0.22 : 0.42,
    metalness: 0.04,
    envMapIntensity: active || timelineDrives ? 1.1 : 0.8,
    side: THREE.DoubleSide,
    toneMapped: false,
  };

  return (
    <group rotation={brainRotation}>
      <group position={leftOffset} rotation={leftRotation}>
        <mesh geometry={data.left.geometry}>
          <meshStandardMaterial {...matProps} />
        </mesh>
      </group>
      <group position={rightOffset} rotation={rightRotation}>
        <mesh geometry={data.right.geometry}>
          <meshStandardMaterial {...matProps} />
        </mesh>
      </group>
    </group>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={styles.segmentGroup}>
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => { if (!option.disabled) onChange(option.key); }}
            disabled={option.disabled}
            style={{
              ...styles.segmentButton,
              ...(isActive ? styles.segmentButtonActive : null),
              ...(option.disabled ? styles.segmentButtonDisabled : null),
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset loading
// ---------------------------------------------------------------------------

async function loadSurfaceAsset(): Promise<SurfaceAssetData> {
  const resp = await fetch(resolvePublicAssetUrl("brain-mesh.json"), {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error("Brain mesh asset not found.");
  const data = JSON.parse(await resp.text()) as LegacyMeshData;
  return {
    vertexCount: data.vertexCount ?? data.vertices.length / 3,
    lhCount: data.lhCount,
    indices: data.indices,
    pialVertices: data.vertices,
  };
}

async function loadModalityMap(): Promise<ModalityMapData | null> {
  try {
    const resp = await fetch(resolvePublicAssetUrl("brain-modality-map.json"), {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    return JSON.parse(await resp.text()) as ModalityMapData;
  } catch {
    return null;
  }
}

function resolvePublicAssetUrl(filename: string) {
  return new URL(filename, document.baseURI).toString();
}

// ---------------------------------------------------------------------------
// Hemisphere geometry construction
// ---------------------------------------------------------------------------

function buildGeometryData(asset: SurfaceAssetData): BrainGeometryData {
  const pialPositions = new Float32Array(asset.pialVertices);
  return {
    left: createHemisphereGeometryData({
      vertexStart: 0,
      vertexEnd: asset.lhCount,
      totalVertexCount: asset.vertexCount,
      pialPositions,
      indices: asset.indices,
    }),
    right: createHemisphereGeometryData({
      vertexStart: asset.lhCount,
      vertexEnd: asset.vertexCount,
      totalVertexCount: asset.vertexCount,
      pialPositions,
      indices: asset.indices,
    }),
  };
}

function createHemisphereGeometryData({
  vertexStart,
  vertexEnd,
  totalVertexCount,
  pialPositions,
  indices,
}: {
  vertexStart: number;
  vertexEnd: number;
  totalVertexCount: number;
  pialPositions: Float32Array;
  indices: number[];
}): HemisphereGeometryData {
  const localPial = pialPositions.slice(vertexStart * 3, vertexEnd * 3);
  const localIndices = extractHemisphereIndices(indices, vertexStart, vertexEnd);
  const vertexCount = vertexEnd - vertexStart;

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(localPial.slice(), 3);
  const colorAttr = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(localIndices), 1));
  geometry.computeVertexNormals();

  const adjacency = buildAdjacency(localIndices, vertexCount);

  return {
    geometry,
    positionAttr,
    colorAttr,
    pialPositions: localPial,
    vertexStart,
    vertexCount,
    totalVertexCount,
    adjacency,
  };
}

function extractHemisphereIndices(
  indices: number[],
  vertexStart: number,
  vertexEnd: number,
) {
  const local: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    if (
      a >= vertexStart && a < vertexEnd &&
      b >= vertexStart && b < vertexEnd &&
      c >= vertexStart && c < vertexEnd
    ) {
      local.push(a - vertexStart, b - vertexStart, c - vertexStart);
    }
  }
  return local;
}

function buildAdjacency(indices: number[], vertexCount: number): number[][] {
  const adj: Set<number>[] = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) adj[i] = new Set();
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }
  return adj.map(s => Array.from(s));
}

// ---------------------------------------------------------------------------
// Per-hemisphere RGB modality coloring (from origin) + diffusion
// ---------------------------------------------------------------------------

const ACT_THRESHOLD = 0.5;
const ACT_RANGE = 1.0 - ACT_THRESHOLD;
const MANUAL_STRENGTH = 4.0;
const AUTO_STRENGTH = 5.0;
const BASE_DIM = 0.10;
const CONTRAST = 2.0;
const DIFFUSION_PASSES = 4;
const DIFFUSION_PULL = 0.3;

function applyModalityColors(
  hemi: HemisphereGeometryData,
  frame: BrainActivation | null,
  modalityMap: ModalityMapData | null,
  active: Modality,
  timelineDrives?: ModalityDrives,
) {
  const colors = hemi.colorAttr.array as Float32Array;
  const n = hemi.vertexCount;
  const verts = frame?.vertices;
  const nAct = verts?.length ?? 0;

  const hasManual = active !== null;
  const drives = timelineDrives ?? { visual: 0, audio: 0, text: 0 };
  const hasDrives = !hasManual && (drives.visual + drives.audio + drives.text) > 0.01;

  const posArr = hemi.pialPositions;

  for (let i = 0; i < n; i++) {
    const gi = hemi.vertexStart + i;

    // Interpolated activation from sparse vertex array
    let rawAct = 0;
    if (verts && nAct > 0) {
      const t = ((gi + 0.5) / hemi.totalVertexCount) * nAct - 0.5;
      const lo = Math.max(0, Math.floor(t));
      const hi = Math.min(nAct - 1, lo + 1);
      const frac = t - lo;
      rawAct = verts[lo] * (1 - frac) + verts[hi] * frac;
    }

    // Deterministic spatial noise from vertex position
    const px = posArr[i * 3], py = posArr[i * 3 + 1], pz = posArr[i * 3 + 2];
    const h1 = Math.sin(px * 73.17 + py * 119.43 + pz * 157.29) * 43758.5453;
    const noise = (h1 - Math.floor(h1)) * 2 - 1;
    rawAct += noise * 0.12;

    const isActive = rawAct > ACT_THRESHOLD;
    const voxelBright = isActive
      ? Math.pow(Math.max(0, (rawAct - ACT_THRESHOLD) / ACT_RANGE), 1 / CONTRAST)
      : 0;

    const isVis = modalityMap ? (modalityMap.visual[gi] ?? 0) > 0.5 : false;
    const isAud = modalityMap ? (modalityMap.audio[gi] ?? 0) > 0.5 : false;
    const isTxt = modalityMap ? (modalityMap.text[gi] ?? 0) > 0.5 : false;
    const inRegion = isVis || isAud || isTxt;

    let r = 0, g = 0, b = 0;

    if (hasManual) {
      const show =
        (active === "visual" && isVis) ||
        (active === "audio" && isAud) ||
        (active === "text" && isTxt);
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

  // Diffusion: bright voxels bleed color into mesh neighbors
  for (let pass = 0; pass < DIFFUSION_PASSES; pass++) {
    const prev = new Float32Array(colors);
    for (let i = 0; i < n; i++) {
      const nb = hemi.adjacency[i];
      if (!nb.length) continue;
      let maxR = 0, maxG = 0, maxB = 0;
      for (let k = 0; k < nb.length; k++) {
        const ni = nb[k];
        const nr = prev[ni * 3], ng = prev[ni * 3 + 1], nb2 = prev[ni * 3 + 2];
        if (nr > maxR) maxR = nr;
        if (ng > maxG) maxG = ng;
        if (nb2 > maxB) maxB = nb2;
      }
      const cr = prev[i * 3], cg = prev[i * 3 + 1], cb = prev[i * 3 + 2];
      if (maxR > cr) colors[i * 3]     = cr + (maxR - cr) * DIFFUSION_PULL;
      if (maxG > cg) colors[i * 3 + 1] = cg + (maxG - cg) * DIFFUSION_PULL;
      if (maxB > cb) colors[i * 3 + 2] = cb + (maxB - cb) * DIFFUSION_PULL;
    }
  }

  hemi.colorAttr.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function findClosestActivation(
  activations: BrainActivation[],
  currentTime: number,
): BrainActivation | null {
  let closest: BrainActivation | null = null;
  let minDist = Infinity;
  for (const a of activations) {
    const d = Math.abs(a.time - currentTime);
    if (d < minDist) { minDist = d; closest = a; }
  }
  return closest;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    position: "relative",
    width: "100%",
    height: 420,
    borderRadius: 8,
    overflow: "hidden",
  },
  statusCard: {
    position: "absolute",
    inset: "50% auto auto 50%",
    transform: "translate(-50%, -50%)",
    padding: "0.8rem 1rem",
    borderRadius: 14,
    background: "rgba(12,12,12,0.9)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e8e8e8",
    fontSize: "0.92rem",
    backdropFilter: "blur(10px)",
  },
  bottomControls: {
    marginTop: "0.75rem",
    display: "flex",
    justifyContent: "center",
  },
  segmentGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    padding: 6,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(7,7,7,0.86)",
    backdropFilter: "blur(14px)",
    minWidth: 180,
  },
  segmentButton: {
    border: "none",
    borderRadius: 12,
    background: "transparent",
    color: "rgba(255,255,255,0.7)",
    padding: "0.6rem 0.75rem",
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 120ms ease, color 120ms ease",
  },
  segmentButtonActive: {
    background: "rgba(255,255,255,0.14)",
    color: "#f6f6f6",
  },
  segmentButtonDisabled: {
    opacity: 0.42,
    cursor: "not-allowed",
  },
  lockHint: {
    fontSize: "0.65rem",
    color: "#555",
    textAlign: "center",
    marginTop: "0.45rem",
  },
};
