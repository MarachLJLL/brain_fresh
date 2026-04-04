import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Maximize2, Minimize2 } from "lucide-react";
import type { BrainActivation } from "../types";

type SurfaceMode = "normal" | "inflated";
type LayoutMode = "closed" | "open";

interface LegacyMeshData {
  vertices: number[];
  indices: number[];
  lhCount: number;
  vertexCount: number;
}

interface SurfaceAssetData {
  mesh: string;
  vertexCount: number;
  lhCount: number;
  indices: number[];
  pialVertices: number[];
  inflatedVertices?: number[];
  sulc?: number[];
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
  inflatedPositions: Float32Array;
  sulc: Float32Array | null;
  sulcMin: number;
  sulcMax: number;
  vertexStart: number;
  vertexCount: number;
  totalVertexCount: number;
}

interface Props {
  activations: BrainActivation[];
  currentTime: number;
}

export default function BrainModel({ activations, currentTime }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("normal");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("closed");
  const [surfaceAsset, setSurfaceAsset] = useState<SurfaceAssetData | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const deferredTime = useDeferredValue(currentTime);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const asset = await loadSurfaceAsset();
        if (!cancelled) {
          setSurfaceAsset(asset);
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
    return () => {
      cancelled = true;
    };
  }, []);

  const shellStyle = {
    ...styles.shell,
    ...(expanded ? styles.shellExpanded : null),
  };
  const viewportStyle = {
    ...styles.viewport,
    ...(expanded ? styles.viewportExpanded : null),
  };
  const canvasWrapStyle = {
    ...styles.canvasWrap,
    ...(expanded ? styles.canvasWrapExpanded : null),
  };

  return (
    <div style={shellStyle}>
      <div style={viewportStyle}>
        <div style={styles.halo} />
        <div style={styles.topBar}>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            style={styles.expandButton}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {expanded ? "Collapse Demo" : "Expand Demo"}
          </button>
          <ActivityLegend />
        </div>

        <div style={canvasWrapStyle}>
          {!surfaceAsset && !assetError && (
            <div style={styles.statusCard}>Loading cortical surface...</div>
          )}
          {assetError && <div style={styles.statusCard}>{assetError}</div>}
          {surfaceAsset && (
            <Canvas
              camera={{ position: [0, 0.16, 4.45], fov: 19 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            >
              <ambientLight intensity={0.95} />
              <directionalLight position={[2.2, 1.8, 2]} intensity={1.4} />
              <directionalLight position={[-2.4, 1.1, 0.8]} intensity={0.65} />
              <pointLight position={[0, -1.6, 2.4]} intensity={0.25} />
              <Environment preset="studio" environmentIntensity={0.45} />
              <CorticalSurface
                asset={surfaceAsset}
                activations={activations}
                currentTime={deferredTime}
                surfaceMode={surfaceMode}
                layoutMode={layoutMode}
              />
              <OrbitControls
                enablePan={false}
                enableZoom={expanded}
                minDistance={3.2}
                maxDistance={6.1}
                target={[0, -0.02, 0]}
              />
            </Canvas>
          )}
        </div>

        <div style={styles.bottomBar}>
          <SegmentedControl
            options={[
              { key: "open", label: "Open" },
              { key: "closed", label: "Close" },
            ]}
            value={layoutMode}
            onChange={(value) => setLayoutMode(value as LayoutMode)}
          />
          <SegmentedControl
            options={[
              { key: "normal", label: "Normal" },
              { key: "inflated", label: "Inflated" },
            ]}
            value={surfaceMode}
            onChange={(value) => setSurfaceMode(value as SurfaceMode)}
          />
        </div>
      </div>
    </div>
  );
}

function CorticalSurface({
  asset,
  activations,
  currentTime,
  surfaceMode,
  layoutMode,
}: {
  asset: SurfaceAssetData;
  activations: BrainActivation[];
  currentTime: number;
  surfaceMode: SurfaceMode;
  layoutMode: LayoutMode;
}) {
  const data = useMemo(() => buildGeometryData(asset), [asset]);
  const frame = useMemo(
    () => findClosestActivation(activations, currentTime),
    [activations, currentTime]
  );

  useEffect(() => {
    applySurfaceLayout(data.left, surfaceMode);
    applySurfaceLayout(data.right, surfaceMode);
  }, [data, surfaceMode]);

  useEffect(() => {
    applySurfaceColors(data.left, frame);
    applySurfaceColors(data.right, frame);
  }, [data, frame]);

  const leftOffset: [number, number, number] =
    layoutMode === "open" ? [-0.98, 0.02, 0] : [0, 0, 0];
  const rightOffset: [number, number, number] =
    layoutMode === "open" ? [0.98, 0.02, 0] : [0, 0, 0];
  const leftRotation: [number, number, number] =
    layoutMode === "open" ? [0, 1.72, 0.03] : [0, 0, 0];
  const rightRotation: [number, number, number] =
    layoutMode === "open" ? [0, -1.72, -0.03] : [0, 0, 0];
  const brainRotation: [number, number, number] =
    layoutMode === "open"
      ? [-Math.PI / 2, 0.12, 0]
      : [-Math.PI / 2, 0.12 + Math.PI / 2, 0];

  return (
    <group rotation={brainRotation} position={[0, -0.05, 0]} scale={0.275}>
      <group position={leftOffset} rotation={leftRotation}>
        <mesh geometry={data.left.geometry}>
          <meshStandardMaterial
            vertexColors
            roughness={0.58}
            metalness={0.02}
            envMapIntensity={0.55}
            side={THREE.DoubleSide}
            transparent
            opacity={0.84}
          />
        </mesh>
      </group>
      <group position={rightOffset} rotation={rightRotation}>
        <mesh geometry={data.right.geometry}>
          <meshStandardMaterial
            vertexColors
            roughness={0.58}
            metalness={0.02}
            envMapIntensity={0.55}
            side={THREE.DoubleSide}
            transparent
            opacity={0.84}
          />
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
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              if (!option.disabled) onChange(option.key);
            }}
            disabled={option.disabled}
            style={{
              ...styles.segmentButton,
              ...(active ? styles.segmentButtonActive : null),
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

function ActivityLegend() {
  return (
    <div style={styles.legendWrap}>
      <div style={styles.legendLabels}>
        <span>Low</span>
        <span>High</span>
      </div>
      <div style={styles.legendBar}>
        <span style={{ ...styles.legendTick, left: "8%" }} />
        <span style={{ ...styles.legendTick, left: "92%" }} />
      </div>
      <div style={styles.legendTitle}>Activity</div>
    </div>
  );
}

async function loadSurfaceAsset(): Promise<SurfaceAssetData> {
  const errors: string[] = [];
  const legacy = await tryLoadJsonAsset<LegacyMeshData>("brain-mesh.json", errors);
  if (legacy) {
    return {
      mesh: "fsaverage5",
      vertexCount: legacy.vertexCount ?? legacy.vertices.length / 3,
      lhCount: legacy.lhCount,
      indices: legacy.indices,
      pialVertices: legacy.vertices,
    };
  }

  throw new Error(errors[0] ?? "Brain surface assets are missing.");
}

function normalizeSurfaceAsset(raw: SurfaceAssetData): SurfaceAssetData {
  return {
    mesh: raw.mesh || "fsaverage5",
    vertexCount: raw.vertexCount ?? raw.pialVertices.length / 3,
    lhCount: raw.lhCount,
    indices: raw.indices,
    pialVertices: raw.pialVertices,
    inflatedVertices: raw.inflatedVertices,
    sulc: raw.sulc,
  };
}

async function tryLoadJsonAsset<T>(
  filename: string,
  errors: string[]
): Promise<T | null> {
  try {
    const response = await fetch(resolvePublicAssetUrl(filename), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const text = await response.text();
    return JSON.parse(text) as T;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unexpected asset load failure.";
    errors.push(`${filename}: ${detail}`);
    return null;
  }
}

function resolvePublicAssetUrl(filename: string) {
  return new URL(filename, document.baseURI).toString();
}

function buildGeometryData(asset: SurfaceAssetData): BrainGeometryData {
  const pialPositions = new Float32Array(asset.pialVertices);
  const combinedGeometry = new THREE.BufferGeometry();
  combinedGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(pialPositions.slice(), 3)
  );
  combinedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(asset.indices), 1));
  combinedGeometry.computeVertexNormals();

  const normalAttr = combinedGeometry.getAttribute("normal") as THREE.BufferAttribute;
  const inflatedPositions = asset.inflatedVertices
    ? new Float32Array(asset.inflatedVertices)
    : buildFallbackInflatedPositions(
        pialPositions,
        new Float32Array(normalAttr.array as ArrayLike<number>),
        asset.lhCount
      );

  const sulc = asset.sulc ? new Float32Array(asset.sulc) : null;
  return {
    left: createHemisphereGeometryData({
      vertexStart: 0,
      vertexEnd: asset.lhCount,
      totalVertexCount: asset.vertexCount,
      pialPositions,
      inflatedPositions,
      sulc,
      indices: asset.indices,
    }),
    right: createHemisphereGeometryData({
      vertexStart: asset.lhCount,
      vertexEnd: asset.vertexCount,
      totalVertexCount: asset.vertexCount,
      pialPositions,
      inflatedPositions,
      sulc,
      indices: asset.indices,
    }),
  };
}

function createHemisphereGeometryData({
  vertexStart,
  vertexEnd,
  totalVertexCount,
  pialPositions,
  inflatedPositions,
  sulc,
  indices,
}: {
  vertexStart: number;
  vertexEnd: number;
  totalVertexCount: number;
  pialPositions: Float32Array;
  inflatedPositions: Float32Array;
  sulc: Float32Array | null;
  indices: number[];
}): HemisphereGeometryData {
  const localPial = sliceVertexRange(pialPositions, vertexStart, vertexEnd);
  const localInflated = sliceVertexRange(inflatedPositions, vertexStart, vertexEnd);
  const localSulc = sulc ? sulc.slice(vertexStart, vertexEnd) : null;
  const localIndices = extractHemisphereIndices(indices, vertexStart, vertexEnd);
  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(localPial.slice(), 3);
  const colorAttr = new THREE.BufferAttribute(
    new Float32Array((vertexEnd - vertexStart) * 3),
    3
  );
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(localIndices), 1));
  geometry.computeVertexNormals();

  const [sulcMin, sulcMax] = getMinMax(localSulc);

  return {
    geometry,
    positionAttr,
    colorAttr,
    pialPositions: localPial,
    inflatedPositions: localInflated,
    sulc: localSulc,
    sulcMin,
    sulcMax,
    vertexStart,
    vertexCount: vertexEnd - vertexStart,
    totalVertexCount,
  };
}

function sliceVertexRange(
  values: Float32Array,
  vertexStart: number,
  vertexEnd: number
) {
  return values.slice(vertexStart * 3, vertexEnd * 3);
}

function extractHemisphereIndices(
  indices: number[],
  vertexStart: number,
  vertexEnd: number
) {
  const localIndices: number[] = [];

  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    if (
      a >= vertexStart &&
      a < vertexEnd &&
      b >= vertexStart &&
      b < vertexEnd &&
      c >= vertexStart &&
      c < vertexEnd
    ) {
      localIndices.push(a - vertexStart, b - vertexStart, c - vertexStart);
    }
  }

  return localIndices;
}

function buildFallbackInflatedPositions(
  positions: Float32Array,
  normals: Float32Array,
  lhCount: number
): Float32Array {
  const inflated = new Float32Array(positions.length);
  const leftCenter = getHemisphereCenter(positions, 0, lhCount);
  const rightCenter = getHemisphereCenter(positions, lhCount, positions.length / 3);

  for (let index = 0; index < positions.length / 3; index += 1) {
    const offset = index * 3;
    const center = index < lhCount ? leftCenter : rightCenter;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    const nx = normals[offset];
    const ny = normals[offset + 1];
    const nz = normals[offset + 2];
    const rx = x - center.x;
    const ry = y - center.y;
    const rz = z - center.z;
    const radialLength = Math.max(0.0001, Math.hypot(rx, ry, rz));
    const radialScale = 0.06 / radialLength;

    inflated[offset] = x + nx * 0.09 + rx * radialScale;
    inflated[offset + 1] = y + ny * 0.09 + ry * radialScale;
    inflated[offset + 2] = z + nz * 0.09 + rz * radialScale;
  }

  return inflated;
}

function getHemisphereCenter(
  positions: Float32Array,
  startVertex: number,
  endVertex: number
) {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = Math.max(1, endVertex - startVertex);

  for (let index = startVertex; index < endVertex; index += 1) {
    const offset = index * 3;
    x += positions[offset];
    y += positions[offset + 1];
    z += positions[offset + 2];
  }

  return { x: x / count, y: y / count, z: z / count };
}

function applySurfaceLayout(data: HemisphereGeometryData, surfaceMode: SurfaceMode) {
  const source =
    surfaceMode === "inflated" ? data.inflatedPositions : data.pialPositions;
  const target = data.positionAttr.array as Float32Array;

  for (let index = 0; index < data.vertexCount; index += 1) {
    const offset = index * 3;
    target[offset] = source[offset];
    target[offset + 1] = source[offset + 1];
    target[offset + 2] = source[offset + 2];
  }

  data.positionAttr.needsUpdate = true;
  data.geometry.computeVertexNormals();
}

function applySurfaceColors(
  data: HemisphereGeometryData,
  frame: BrainActivation | null
) {
  const target = data.colorAttr.array as Float32Array;
  const source = frame?.vertices ?? [];
  const sourceCount = source.length;

  for (let index = 0; index < data.vertexCount; index += 1) {
    const globalIndex = data.vertexStart + index;
    const activity =
      sourceCount > 0
        ? Math.abs(
            source[
              Math.min(
                sourceCount - 1,
                Math.floor((globalIndex / data.totalVertexCount) * sourceCount)
              )
            ] ?? 0
          )
        : 0;
    const base = getBaseGray(data, index);
    const heat = getActivityColor(Math.pow(clamp01(activity), 1.12));
    const blend = smoothstep(0.06, 0.72, activity);
    const offset = index * 3;

    target[offset] = mix(base, heat.r, blend);
    target[offset + 1] = mix(base, heat.g, blend);
    target[offset + 2] = mix(base, heat.b, blend);
  }

  data.colorAttr.needsUpdate = true;
}

function getBaseGray(data: HemisphereGeometryData, index: number): number {
  if (!data.sulc) return 0.56;
  const raw = data.sulc[index] ?? 0;
  const normalized =
    (raw - data.sulcMin) / Math.max(0.0001, data.sulcMax - data.sulcMin);
  return 0.3 + (1 - normalized) * 0.2;
}

function getActivityColor(value: number) {
  const stops = [
    { at: 0, color: [0.36, 0.06, 0.02] },
    { at: 0.28, color: [0.84, 0.22, 0.06] },
    { at: 0.6, color: [0.98, 0.5, 0.08] },
    { at: 1, color: [1, 0.92, 0.74] },
  ] as const;

  for (let index = 1; index < stops.length; index += 1) {
    const next = stops[index];
    const prev = stops[index - 1];
    if (value <= next.at) {
      const mixAmount = (value - prev.at) / (next.at - prev.at);
      return {
        r: mix(prev.color[0], next.color[0], mixAmount),
        g: mix(prev.color[1], next.color[1], mixAmount),
        b: mix(prev.color[2], next.color[2], mixAmount),
      };
    }
  }

  const last = stops[stops.length - 1].color;
  return { r: last[0], g: last[1], b: last[2] };
}

function findClosestActivation(
  activations: BrainActivation[],
  currentTime: number
): BrainActivation | null {
  let closest: BrainActivation | null = null;
  let minDistance = Infinity;

  for (const activation of activations) {
    const distance = Math.abs(activation.time - currentTime);
    if (distance < minDistance) {
      minDistance = distance;
      closest = activation;
    }
  }

  return closest;
}

function getMinMax(values: Float32Array | null): [number, number] {
  if (!values || values.length === 0) return [0, 1];
  let min = values[0];
  let max = values[0];

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return [min, max];
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    position: "relative",
    minHeight: 620,
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "radial-gradient(circle at 50% 38%, rgba(255,255,255,0.08), transparent 34%), #030303",
    overflow: "hidden",
    boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
  },
  shellExpanded: {
    position: "fixed",
    inset: 24,
    zIndex: 500,
    minHeight: "unset",
  },
  viewport: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 620,
  },
  viewportExpanded: {
    minHeight: "100%",
  },
  halo: {
    position: "absolute",
    inset: "18% 20% 20%",
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 48%, transparent 70%)",
    filter: "blur(8px)",
    pointerEvents: "none",
  },
  topBar: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    zIndex: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "1rem",
  },
  expandButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.8rem 1.2rem",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.52)",
    color: "#f2f2f2",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
  },
  legendWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: 240,
    color: "#ececec",
    textAlign: "center",
  },
  legendLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.82rem",
    marginBottom: "0.3rem",
    letterSpacing: "0.02em",
  },
  legendBar: {
    position: "relative",
    height: 10,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, #4b0404 0%, #ac2810 35%, #f1a532 72%, #fdf4d4 100%)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
  },
  legendTick: {
    position: "absolute",
    top: -5,
    width: 3,
    height: 20,
    borderRadius: 2,
    background: "rgba(255,255,255,0.85)",
    transform: "translateX(-50%)",
  },
  legendTitle: {
    marginTop: "0.35rem",
    fontSize: "0.82rem",
    letterSpacing: "0.03em",
  },
  canvasWrap: {
    height: 620,
  },
  canvasWrapExpanded: {
    height: "100%",
  },
  bottomBar: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 18,
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
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
  },
  segmentButton: {
    border: "none",
    borderRadius: 12,
    background: "transparent",
    color: "rgba(255,255,255,0.7)",
    padding: "0.85rem 0.75rem",
    fontSize: "0.98rem",
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
};
