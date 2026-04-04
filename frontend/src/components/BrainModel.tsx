import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { BrainActivation } from "../types";

interface Props {
  activations: BrainActivation[];
  currentTime: number;
}

export default function BrainModel({ activations, currentTime }: Props) {
  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Brain Activation</h3>
      <div style={styles.canvasWrap}>
        <Canvas camera={{ position: [0, 0, 2.5], fov: 50 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-3, -3, 2]} intensity={0.3} />
          <BrainMesh activations={activations} currentTime={currentTime} />
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            autoRotate={true}
            autoRotateSpeed={0.5}
          />
        </Canvas>
      </div>
      <div style={styles.legend}>
        <span style={{ color: "#3b82f6" }}>Low</span>
        <div style={styles.gradient} />
        <span style={{ color: "#ef4444" }}>High</span>
      </div>
    </div>
  );
}

/**
 * 3D brain mesh using a sphere-based cortical approximation.
 * Vertex colors are driven by the TRIBE v2 activation data,
 * mapped to the brain's folded surface topology.
 */
function BrainMesh({
  activations,
  currentTime,
}: {
  activations: BrainActivation[];
  currentTime: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const colorsRef = useRef<Float32Array | null>(null);

  // Build brain-like geometry by deforming a sphere with cortical folds
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 96, 64);
    const positions = geo.attributes.position;

    // Apply cortical fold deformations to make it look brain-like
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Flatten on the medial side (x near 0) to create hemispheric shape
      const hemisphereScale = 0.85 + 0.15 * Math.abs(x);

      // Add sulci (grooves) using layered sine waves
      const fold1 = Math.sin(x * 8 + y * 6) * 0.03;
      const fold2 = Math.sin(y * 12 + z * 8) * 0.02;
      const fold3 = Math.sin(x * 5 + z * 10) * 0.025;

      // Elongate slightly front-to-back
      const elongate = 1.0 + 0.15 * (1 - y * y);

      const r = Math.sqrt(x * x + y * y + z * z);
      const scale = hemisphereScale * elongate + fold1 + fold2 + fold3;

      if (r > 0) {
        positions.setXYZ(
          i,
          (x / r) * scale,
          (y / r) * scale * 0.9,
          (z / r) * scale * 1.05
        );
      }
    }

    geo.computeVertexNormals();

    // Initialize vertex colors
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      colors[i * 3] = 0.15;
      colors[i * 3 + 1] = 0.15;
      colors[i * 3 + 2] = 0.2;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    colorsRef.current = colors;

    return geo;
  }, []);

  // Update vertex colors based on current activation data
  useEffect(() => {
    if (!activations.length || !colorsRef.current || !meshRef.current) return;

    // Find the closest activation frame to current time
    let closest = activations[0];
    let minDist = Infinity;
    for (const a of activations) {
      const d = Math.abs(a.time - currentTime);
      if (d < minDist) {
        minDist = d;
        closest = a;
      }
    }

    const colors = colorsRef.current;
    const vertices = closest.vertices;
    const numActivation = vertices.length;
    const numGeoVerts = colors.length / 3;

    for (let i = 0; i < numGeoVerts; i++) {
      // Map geometry vertex to activation vertex
      const ai = Math.floor((i / numGeoVerts) * numActivation);
      const val = Math.max(0, Math.min(1, (vertices[ai] + 1) / 2)); // map [-1,1] to [0,1]

      // Color ramp: blue (low) -> purple (mid) -> red/orange (high)
      if (val < 0.5) {
        const t = val * 2;
        colors[i * 3] = 0.1 + t * 0.4;     // R
        colors[i * 3 + 1] = 0.1 + t * 0.05; // G
        colors[i * 3 + 2] = 0.4 - t * 0.1;  // B
      } else {
        const t = (val - 0.5) * 2;
        colors[i * 3] = 0.5 + t * 0.5;      // R
        colors[i * 3 + 1] = 0.15 + t * 0.3;  // G
        colors[i * 3 + 2] = 0.3 - t * 0.25;  // B
      }
    }

    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }, [activations, currentTime, geometry]);

  // Gentle idle rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshPhongMaterial vertexColors shininess={30} />
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
    alignItems: "center",
  },
  title: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#ccc",
    marginBottom: "0.5rem",
    alignSelf: "flex-start",
  },
  canvasWrap: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    overflow: "hidden",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "0.5rem",
    fontSize: "0.75rem",
  },
  gradient: {
    width: 80,
    height: 6,
    borderRadius: 3,
    background: "linear-gradient(90deg, #1e3a8a, #7c3aed, #ef4444)",
  },
};
