import { useCallback, useEffect, useState } from "react";
import Museum from "./components/Museum";
import Intro from "./components/Intro";
import Lightbox from "./components/Lightbox";
import Manage from "./components/Manage";
import type { Photo } from "./types";

export default function App() {
  const [entered, setEntered] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [managing, setManaging] = useState(false);

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch("/api/photos");
      if (!res.ok) throw new Error("API unavailable");
      const data = (await res.json()) as Photo[];
      setPhotos(data);
    } catch {
      // No back end (static preview) — fall back to bundled demo photos.
      try {
        const base = import.meta.env.BASE_URL;
        const res = await fetch(`${base}demo-photos.json`);
        const data = (await res.json()) as Photo[];
        setPhotos(data.map((p) => ({ ...p, url: `${base}${p.url}` })));
      } catch {
        setPhotos([]);
      }
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  return (
    <div className="app">
      <Museum photos={photos} active={entered} onSelect={setLightboxIndex} />

      {!entered && <Intro onEnter={() => setEntered(true)} />}

      {entered && (
        <div className="hud">
          <div className="hud-top">
            <h1 className="hud-title">Unkwnphoto</h1>
            <button className="manage-link" onClick={() => setManaging(true)}>
              Manage photos
            </button>
          </div>
          {photos.length > 0 && (
            <div className="hud-hint" aria-hidden="true">
              drag to look · ▲ ▼ or arrow keys to walk
            </div>
          )}
        </div>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {managing && (
        <Manage
          photos={photos}
          onClose={() => setManaging(false)}
          onChanged={loadPhotos}
        />
      )}
    </div>
  );
}
