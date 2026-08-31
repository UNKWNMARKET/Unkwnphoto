import { useState } from "react";
import type { Album, Photo } from "../types";
import { linkProps } from "../lib/router";
import Lightbox from "./Lightbox";

interface AlbumViewProps {
  album: Album;
  photos: Photo[];
}

export default function AlbumView({ album, photos }: AlbumViewProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <div className="album">
      <header className="album-head">
        <a {...linkProps("/")} className="back-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 4l-8 8 8 8" />
          </svg>
          All albums
        </a>
        <h1 className="album-title">{album.name}</h1>
        {album.description && <p className="album-description">{album.description}</p>}
        <p className="album-count">
          {photos.length} {photos.length === 1 ? "photograph" : "photographs"}
        </p>
      </header>

      {photos.length === 0 ? (
        <div className="empty">
          <p className="empty-title">This album is empty.</p>
        </div>
      ) : (
        <div className="plates">
          {photos.map((photo, i) => (
            <figure className="plate" key={photo.id}>
              <button
                className="plate-button"
                onClick={() => setLightbox(i)}
                aria-label={`View ${photo.title} larger`}
              >
                <img
                  src={photo.url}
                  alt={photo.title}
                  loading={i < 2 ? "eager" : "lazy"}
                  decoding="async"
                  /* aspect-ratio reserves the exact box so the page never
                     jumps as photographs arrive. max-width is the height cap
                     expressed as a width, so a tall frame is never taller
                     than the viewport and never gets letterboxed to do it. */
                  style={
                    photo.width && photo.height
                      ? {
                          aspectRatio: `${photo.width} / ${photo.height}`,
                          maxWidth: `calc(84vh * ${photo.width / photo.height})`
                        }
                      : undefined
                  }
                />
              </button>
              <figcaption className="plate-caption">{photo.title}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {lightbox !== null && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}
    </div>
  );
}
