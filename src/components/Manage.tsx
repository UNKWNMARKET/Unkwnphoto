import { useRef, useState } from "react";
import type { Photo } from "../types";

interface ManageProps {
  photos: Photo[];
  onClose: () => void;
  onChanged: () => void;
}

export default function Manage({ photos, onClose, onChanged }: ManageProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Please choose an image to upload.");
      return;
    }
    const form = new FormData();
    form.append("photo", file);
    form.append("title", title);
    form.append("description", description);

    setBusy(true);
    try {
      const res = await fetch("/api/photos", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed.");
      }
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this photo?")) return;
    try {
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
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

        <form className="manage-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Image file</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              placeholder="e.g. Midnight Coastline"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              rows={3}
              placeholder="A short note about this shot…"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {error && <p className="manage-error">{error}</p>}
          <button className="manage-submit" type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Upload photo"}
          </button>
        </form>

        <div className="manage-list">
          <h3>{photos.length} photo{photos.length === 1 ? "" : "s"}</h3>
          <ul>
            {photos.map((p) => (
              <li key={p.id}>
                <img src={p.url} alt={p.title} />
                <div className="manage-list-meta">
                  <strong>{p.title}</strong>
                  {p.description && <span>{p.description}</span>}
                </div>
                <button
                  className="manage-delete"
                  onClick={() => handleDelete(p.id)}
                >
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
