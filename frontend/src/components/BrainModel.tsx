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

type Modality = "visual" | "text" | "audio" | null;

interface Props {
  activations: BrainActivation[];
  currentTime: number;
}

const MODALITIES: { key: Modality & string; label: string; hint: string; color: string }[] = [
  { key: "visual", label: "Visual", hint: "Occipital cortex", color: "#ff2020" },
  { key: "audio", label: "Audio", hint: "Auditory cortex", color: "#00ee44" },
  { key: "text", label: "Text", hint: "Language network", color: "#2266ff" },
];

export default function BrainModel({ activations, currentTime }: Props) {
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
          />
          <OrbitControls
            enableZoom
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.45}
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

function gaussLobe(x: number, center: number, sharpness: number): number {
  const d = x - center;
  return Math.exp(-sharpness * d * d);
}

function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function gaussDist(d: number, sharpness: number): number {
  return Math.exp(-sharpness * d * d);
}

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

    const visualMask = new Float32Array(vertexCount);
    const audioMask = new Float32Array(vertexCount);
    const textMask = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const px = posArr[i * 3];
      const py = posArr[i * 3 + 1];
      const pz = posArr[i * 3 + 2];
      const isLeft = i < lhCount;

      // fsaverage5 RAS: X=right, Y=anterior, Z=superior
      // Visual: occipital pole = posterior = -Y
      visualMask[i] = Math.max(0, gaussLobe(-py, 0.55, 3.5));

      // Auditory: lateral temporal, bilateral
      const lateralness = Math.abs(px);
      const midHeight = 1 - Math.abs(pz - 0.05) * 3;
      audioMask[i] = Math.max(0,
        gaussLobe(lateralness, 0.72, 6) *
        Math.max(0, midHeight) *
        gaussLobe(-py, -0.1, 1.5)
      );

      // Language: left perisylvian only
      if (isLeft) {
        const broca = gaussDist(dist3(px, py, pz, -0.55, 0.45, 0.25), 4.5);
        const wernicke = gaussDist(dist3(px, py, pz, -0.65, -0.25, 0.1), 4.5);
        const angular = gaussDist(dist3(px, py, pz, -0.48, -0.35, 0.40), 5.0);
        textMask[i] = Math.max(broca, wernicke, angular);
      }
    }

    return { geometry: geo, colors, visualMask, audioMask, textMask };
  }, [meshData]);
}

function CorticalBrain({
  activations, currentTime, active,
}: {
  activations: BrainActivation[]; currentTime: number;
  active: Modality;
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

    const vis = active === "visual" ? 1 : 0;
    const aud = active === "audio" ? 1 : 0;
    const txt = active === "text" ? 1 : 0;
    const STRENGTH = 6.0;

    for (let i = 0; i < n; i++) {
      // Dim base when a modality is active so the glow pops
      const baseBright = active ? 0.22 : 0.55;
      let r = baseBright, g = baseBright, b = baseBright;

      if (verts && nAct > 0) {
        const ai = Math.min(nAct - 1, Math.floor(((i + 0.5) / n) * nAct));
        const v = Math.max(0, Math.min(1, (verts[ai] + 1) / 2));
        const brightness = 0.35 + v * 0.65;
        r *= brightness;
        g *= brightness;
        b *= brightness;
      }

      r += visualMask[i] * vis * STRENGTH;
      g += audioMask[i] * aud * STRENGTH;
      b += textMask[i] * txt * STRENGTH;

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }, [brainGeo, activations, currentTime, active]);

  // fsaverage5 uses RAS: X=right, Y=anterior, Z=superior.
  // Three.js screen: Y=up. Tilt the parent group by -90° around X
  // so brain-Z (superior) maps to screen-Y (up).
  // Then spinning the mesh around its local Z rotates like a head turning.
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 0.15;
    }
  });

  if (!brainGeo) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={meshRef} geometry={brainGeo.geometry} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={active ? 0.22 : 0.42}
          metalness={0.04}
          envMapIntensity={active ? 1.1 : 0.8}
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
