import { useCallback, useState } from "react";
import { Upload, Film } from "lucide-react";

interface Props {
  onUpload: (file: File) => void;
}

export default function VideoUpload({ onUpload }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) {
        onUpload(file);
      }
    },
    [onUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
    },
    [onUpload]
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Film size={32} color="#8b5cf6" />
        <h1 style={styles.title}>Brain Fresh</h1>
        <p style={styles.subtitle}>
          Analyze video engagement using neural brain encoding
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          ...styles.dropzone,
          borderColor: isDragging ? "#8b5cf6" : "#333",
          background: isDragging ? "rgba(139, 92, 246, 0.08)" : "rgba(255,255,255,0.02)",
        }}
      >
        <Upload size={48} color={isDragging ? "#8b5cf6" : "#666"} />
        <p style={styles.dropText}>
          Drag & drop your video here
        </p>
        <p style={styles.dropSubtext}>or</p>
        <label style={styles.button}>
          Browse Files
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </label>
        <p style={styles.formats}>Supports MP4, AVI, MKV, MOV, WebM</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
  },
  header: {
    textAlign: "center",
    marginBottom: "3rem",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: 700,
    background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginTop: "0.5rem",
  },
  subtitle: {
    color: "#888",
    marginTop: "0.5rem",
    fontSize: "1.1rem",
  },
  dropzone: {
    width: "100%",
    maxWidth: 560,
    padding: "4rem 2rem",
    border: "2px dashed #333",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dropText: {
    fontSize: "1.2rem",
    color: "#ccc",
  },
  dropSubtext: {
    color: "#666",
    fontSize: "0.9rem",
  },
  button: {
    padding: "0.75rem 2rem",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  formats: {
    color: "#555",
    fontSize: "0.8rem",
    marginTop: "0.5rem",
  },
};
