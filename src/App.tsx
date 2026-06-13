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
      const data = (await res.json()) as Photo[];
      setPhotos(data);
    } catch {
      setPhotos([]);
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
