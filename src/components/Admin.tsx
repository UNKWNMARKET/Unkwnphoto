import { useCallback, useMemo, useRef, useState } from "react";
import type { Album, Photo } from "../types";
import {
  createAlbum,
  deleteAlbum,
  deletePhoto,
  logout,
  reorderPhotos,
  updateAlbum,
  updatePhoto,
  uploadPhotos
} from "../lib/api";

interface AdminProps {
  albums: Album[];
  photos: Photo[];
  onChanged: () => Promise<void> | void;
  onSignedOut: () => void;
}

export default function Admin({ albums, photos, onChanged, onSignedOut }: AdminProps) {
  const [selectedId, setSelectedId] = useState<string | null>(albums[0]?.id ?? null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keep a valid selection as albums come and go.
  const selected = useMemo(
    () => albums.find((a) => a.id === selectedId) ?? albums[0],
    [albums, selectedId]
  );
  const albumPhotos = useMemo(
    () =>
      selected
        ? photos.filter((p) => p.albumId === selected.id).sort((a, b) => a.order - b.order)
        : [],
    [photos, selected]
  );

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        await onChanged();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [onChanged]
  );

  async function handleCreateAlbum(e: React.FormEvent) {
    e.preventDefault();
    const name = newAlbumName.trim();
    if (!name) return;
    setNewAlbumName("");
    await run(async () => {
      const album = await createAlbum(name);
      setSelectedId(album.id);
    });
  }

  const handleFiles = useCallback(
    async (incoming: FileList | File[]) => {
      if (!selected) {
        setError("Make an album first, then add photos to it.");
        return;
      }
      const files = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
      if (!files.length) {
        setError("Those files don't look like images.");
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const { failed } = await uploadPhotos(selected.id, files, (done, total) =>
          setProgress({ done, total })
        );
        if (failed.length) {
          setError(
            `${failed.length} of ${files.length} didn't upload (${failed
              .slice(0, 3)
              .join(", ")}${failed.length > 3 ? "…" : ""}). Try those again.`
          );
        }
        await onChanged();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
        setProgress(null);
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [selected, onChanged]
  );

  async function move(photo: Photo, delta: number) {
    const order = albumPhotos.map((p) => p.id);
    const from = order.indexOf(photo.id);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    await run(() => reorderPhotos(photo.albumId, order));
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1 className="admin-title">Your photos</h1>
          <p className="admin-sub">Only you can see this page.</p>
        </div>
        <button
          className="button ghost"
          onClick={() => run(async () => {
            await logout();
            onSignedOut();
          })}
        >
          Sign out
        </button>
      </header>

      {error && <p className="form-error banner">{error}</p>}

      <section className="admin-section">
        <h2 className="admin-section-title">Albums</h2>
        <div className="album-chips">
          {albums.map((album) => {
            const count = photos.filter((p) => p.albumId === album.id).length;
            return (
              <button
                key={album.id}
                className={`album-chip${selected?.id === album.id ? " active" : ""}`}
                onClick={() => setSelectedId(album.id)}
              >
                {album.name}
                <span className="album-chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        <form className="inline-form" onSubmit={handleCreateAlbum}>
          <input
            value={newAlbumName}
            placeholder="New album name…"
            aria-label="New album name"
            onChange={(e) => setNewAlbumName(e.target.value)}
          />
          <button className="button primary" type="submit" disabled={!newAlbumName.trim()}>
            Create album
          </button>
        </form>
      </section>

      {selected && (
        <section className="admin-section">
          <div className="admin-album-head">
            <label className="field grow">
              <span className="field-label">Album name</span>
              <input
                key={`${selected.id}-name`}
                defaultValue={selected.name}
                aria-label="Album name"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== selected.name) {
                    run(() => updateAlbum(selected.id, { name: value }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </label>
            <button
              className="button danger"
              onClick={() => {
                const count = photos.filter((p) => p.albumId === selected.id).length;
                const message = count
                  ? `Delete "${selected.name}" and its ${count} photo${count === 1 ? "" : "s"}? This can't be undone.`
                  : `Delete "${selected.name}"?`;
                if (window.confirm(message)) {
                  run(async () => {
                    await deleteAlbum(selected.id);
                    setSelectedId(null);
                  });
                }
              }}
            >
              Delete album
            </button>
          </div>

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
              if (!busy && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => !busy && fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
              }}
            />
            {busy && progress ? (
              <>
                <p className="dropzone-title">
                  Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                </p>
                <div className="dropzone-bar">
                  <div
                    className="dropzone-bar-fill"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="dropzone-title">Add photos to {selected.name}</p>
                <p className="dropzone-sub">
                  Drag them here, or tap to choose — as many as you like
                </p>
              </>
            )}
          </div>

          {albumPhotos.length > 0 && (
            <ul className="photo-rows">
              {albumPhotos.map((photo, i) => (
                <li className="photo-row" key={photo.id}>
                  <img src={photo.url} alt="" className="photo-row-thumb" loading="lazy" />
                  <input
                    className="photo-row-title"
                    key={`${photo.id}-title`}
                    defaultValue={photo.title}
                    aria-label="Photo name"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== photo.title) {
                        run(() => updatePhoto(photo.id, { title: value }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="photo-row-actions">
                    <button
                      className="icon-button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(photo, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Move down"
                      disabled={i === albumPhotos.length - 1}
                      onClick={() => move(photo, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={`text-button${selected.coverPhotoId === photo.id ? " on" : ""}`}
                      onClick={() =>
                        run(() => updateAlbum(selected.id, { coverPhotoId: photo.id }))
                      }
                      disabled={selected.coverPhotoId === photo.id}
                    >
                      {selected.coverPhotoId === photo.id ? "Cover" : "Make cover"}
                    </button>
                    <button
                      className="text-button danger"
                      onClick={() => {
                        if (window.confirm(`Delete "${photo.title}"?`)) {
                          run(() => deletePhoto(photo.id));
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
