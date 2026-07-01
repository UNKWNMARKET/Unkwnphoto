import { useCallback, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { Photo } from "../types";

interface ManageProps {
  photos: Photo[];
  onClose: () => void;
  onChanged: () => void;
}

// "DSC03625.jpeg" -> "Dsc03625", "old-truck_1.jpg" -> "Old Truck 1"
function titleFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  const words = stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Untitled";
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Manage({ photos, onClose, onChanged }: ManageProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const files = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
      if (!files.length) {
        setError("Those files don't look like images.");
        return;
      }
      setError(null);
      setBusy(true);
      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress({ done: i, total: files.length });
        try {
          const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const blob = await upload(`photos/${Date.now()}-${safe}`, f, {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: f.type || undefined
          });
          const res = await fetch("/api/photos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: titleFromFilename(f.name),
              description: "",
              url: blob.url,
              pathname: blob.pathname
            })
          });
          if (!res.ok) throw new Error("save failed");
        } catch {
          failed.push(f.name);
        }
      }
      setProgress(null);
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (failed.length) {
        setError(
          `${failed.length} of ${files.length} didn't upload (${failed
            .slice(0, 3)
            .join(", ")}${failed.length > 3 ? "…" : ""}). Try those again.`
        );
      }
      onChanged();
    },
    [onChanged]
  );

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this photo?")) return;
    try {
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error();
      onChanged();
    } catch {
      setError("Delete failed — try again.");
    }
  }

  async function saveField(id: string, field: "title" | "description", value: string) {
    const photo = photos.find((p) => p.id === id);
    if (!photo || photo[field] === value.trim()) return;
    try {
      const res = await fetch(`/api/photos/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value })
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      setError("Couldn't save that edit — try again.");
    }
  }

  return (
    <div className="manage" role="dialog" aria-modal="true">
      <div className="manage-panel">
        <header className="manage-head">
          <h2>Manage photos</h2>
          <button className="manage-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div
          className={`dropzone${dragOver ? " over" : ""}${busy ? " busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => !busy && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
            }}
          />
          {busy && progress ? (
            <>
              <div className="dropzone-title">
                Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
              </div>
              <div className="dropzone-bar">
                <div
                  className="dropzone-bar-fill"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="dropzone-title">Tap to add photos</div>
              <div className="dropzone-sub">
                or drag &amp; drop — pick as many as you like, they hang themselves
              </div>
            </>
          )}
        </div>

        {error && <p className="manage-error">{error}</p>}

        <div className="manage-list">
          <h3>
            {photos.length} photo{photos.length === 1 ? "" : "s"} on the walls
          </h3>
          <ul>
            {photos.map((p) => (
              <li key={p.id}>
                <img src={p.url} alt={p.title} />
                <div className="manage-list-meta">
                  <input
                    className="edit-title"
                    defaultValue={p.title}
                    aria-label="Photo title"
                    onBlur={(e) => saveField(p.id, "title", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <input
                    className="edit-desc"
                    defaultValue={p.description}
                    placeholder="Add a caption…"
                    aria-label="Photo caption"
                    onBlur={(e) => saveField(p.id, "description", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
                <button className="manage-delete" onClick={() => handleDelete(p.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
