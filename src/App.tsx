import { useCallback, useEffect, useState } from "react";
import SpaceScene from "./components/SpaceScene";
import Intro from "./components/Intro";
import Gallery from "./components/Gallery";
import Lightbox from "./components/Lightbox";
import Manage from "./components/Manage";
import type { Photo } from "./types";

export default function App() {
  const [entered, setEntered] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [managing, setManaging] = useState(false);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/photos");
      if (!res.ok) throw new Error("API unavailable");
      const data = (await res.json()) as Photo[];
      setPhotos(data);
    } catch {
      // No back end (e.g. the static GitHub Pages preview) — fall back to the
      // bundled demo photos so the gallery still has something to show.
      try {
        const base = import.meta.env.BASE_URL;
        const res = await fetch(`${base}demo-photos.json`);
        const data = (await res.json()) as Photo[];
        setPhotos(data.map((p) => ({ ...p, url: `${base}${p.url}` })));
      } catch {
        setPhotos([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  return (
    <div className="app">
      <SpaceScene />

      {!entered && <Intro onEnter={() => setEntered(true)} />}

      {entered && (
        <div className="stage">
          <Gallery
            photos={photos}
            loading={loading}
            onSelect={setLightboxIndex}
            onOpenManage={() => setManaging(true)}
          />
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
