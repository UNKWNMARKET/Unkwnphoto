import type { Photo } from "../types";

interface GalleryProps {
  photos: Photo[];
  loading: boolean;
  onSelect: (index: number) => void;
  onOpenManage: () => void;
}

export default function Gallery({
  photos,
  loading,
  onSelect,
  onOpenManage
}: GalleryProps) {
  return (
    <main className="gallery-wrap">
      <header className="gallery-header">
        <h1 className="gallery-title">Unkwnphoto</h1>
        <p className="gallery-sub">A journey through light and space</p>
        <button className="manage-link" onClick={onOpenManage}>
          Manage photos
        </button>
      </header>

      {loading && <p className="gallery-status">Loading the gallery…</p>}

      {!loading && photos.length === 0 && (
        <p className="gallery-status">
          No photos yet. Open <strong>Manage photos</strong> to upload your first
          image.
        </p>
      )}

      <section className="gallery-grid">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            className="card"
            onClick={() => onSelect(i)}
            aria-label={`View ${photo.title}`}
          >
            <div className="card-media">
              <img src={photo.url} alt={photo.title} loading="lazy" />
            </div>
            <div className="card-body">
              <h3 className="card-title">{photo.title}</h3>
              {photo.description && (
                <p className="card-desc">{photo.description}</p>
              )}
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
