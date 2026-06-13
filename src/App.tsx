import { useCallback, useEffect, useState } from "react";
import Universe from "./components/Universe";
import Intro from "./components/Intro";
import Lightbox from "./components/Lightbox";
import Manage from "./components/Manage";
import type { Photo } from "./types";

type Phase = "intro" | "warping" | "entered";

export default function App() {
  const [phase, setPhase] = useState<Phase>("intro");
  const entered = phase === "entered";
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
      // No back end (e.g. the static GitHub Pages preview) — fall back to the
      // bundled demo photos so the journey still has something to show.
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

  const enter = useCallback(() => {
    setPhase("warping");
    window.setTimeout(() => setPhase("entered"), 1900);
  }, []);

  return (
    <div className="app">
      <Universe photos={photos} active={entered} onSelect={setLightboxIndex} />

      {phase !== "entered" && (
        <Intro onEnter={enter} leaving={phase === "warping"} />
      )}

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
              scroll to travel the system
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
