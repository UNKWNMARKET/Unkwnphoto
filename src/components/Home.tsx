import type { Album, Photo } from "../types";
import { linkProps } from "../lib/router";

interface HomeProps {
  albums: Album[];
  photos: Photo[];
  loading: boolean;
}

function coverFor(album: Album, photos: Photo[]): Photo | undefined {
  const inAlbum = photos.filter((p) => p.albumId === album.id);
  return inAlbum.find((p) => p.id === album.coverPhotoId) ?? inAlbum[0];
}

export default function Home({ albums, photos, loading }: HomeProps) {
  if (loading) return <div className="loading" aria-live="polite" />;

  if (!albums.length) {
    return (
      <div className="empty">
        <p className="empty-title">No albums yet.</p>
        <p className="empty-body">
          Sign in at <a {...linkProps("/admin")}>/admin</a> to make your first album.
        </p>
      </div>
    );
  }

  return (
    <ul className="album-index">
      {albums.map((album) => {
        const cover = coverFor(album, photos);
        const count = photos.filter((p) => p.albumId === album.id).length;
        return (
          <li key={album.id} className="album-card">
            <a {...linkProps(`/a/${album.id}`)} className="album-card-link">
              <div className="album-card-frame">
                {cover ? (
                  <img
                    src={cover.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="album-card-image"
                  />
                ) : (
                  <div className="album-card-placeholder" aria-hidden="true" />
                )}
              </div>
              <div className="album-card-meta">
                <h2 className="album-card-name">{album.name}</h2>
                <span className="album-card-count">
                  {count} {count === 1 ? "photograph" : "photographs"}
                </span>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
