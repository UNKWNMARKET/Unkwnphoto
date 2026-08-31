import { del, list, put } from "@vercel/blob";

export interface Photo {
  id: string;
  albumId: string;
  title: string;
  url: string;
  /** Blob pathname, kept so the file can be deleted later. */
  pathname?: string;
  width?: number;
  height?: number;
  /** Position within its album, ascending. */
  order: number;
  createdAt: string;
}

export interface Album {
  id: string;
  name: string;
  description: string;
  /** Photo id used as the album's cover; falls back to the first photo. */
  coverPhotoId?: string;
  order: number;
  createdAt: string;
}

export interface Library {
  version: number;
  albums: Album[];
  photos: Photo[];
}

const LIBRARY_PATH = "metadata/library.json";
// The pre-albums schema: a flat Photo[] with no albumId.
const LEGACY_PATH = "metadata/photos.json";

export const EMPTY_LIBRARY: Library = { version: 2, albums: [], photos: [] };

async function fetchBlobJson(prefix: string): Promise<unknown | null> {
  const { blobs } = await list({ prefix, limit: 1 });
  if (!blobs.length) return null;
  // Blob URLs are CDN-cached; the timestamp busts it so we never act on a
  // stale index, and the header stops any intermediary caching the response.
  const res = await fetch(`${blobs[0].url}?ts=${Date.now()}`, {
    headers: { "cache-control": "no-cache" }
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Adopts photos saved under the old flat schema into a starter album.
 * Non-destructive: the legacy file is left untouched, so nothing is lost if
 * this runs against an unexpected shape.
 */
function migrateLegacy(rows: unknown): Library {
  if (!Array.isArray(rows) || rows.length === 0) return { ...EMPTY_LIBRARY };
  const album: Album = {
    id: "legacy-selected-work",
    name: "Selected Work",
    description: "",
    order: 0,
    createdAt: new Date().toISOString()
  };
  const photos: Photo[] = rows
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.url === "string" && (r.url as string).startsWith("http"))
    .map((r, i) => ({
      id: typeof r.id === "string" ? r.id : `legacy-${i}`,
      albumId: album.id,
      title: typeof r.title === "string" && r.title.trim() ? r.title : "Untitled",
      url: r.url as string,
      pathname: typeof r.pathname === "string" ? r.pathname : undefined,
      order: i,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString()
    }));
  if (!photos.length) return { ...EMPTY_LIBRARY };
  album.coverPhotoId = photos[0].id;
  return { version: 2, albums: [album], photos };
}

export async function readLibrary(): Promise<Library> {
  const current = await fetchBlobJson(LIBRARY_PATH);
  if (current && typeof current === "object") {
    const lib = current as Partial<Library>;
    return {
      version: 2,
      albums: Array.isArray(lib.albums) ? lib.albums : [],
      photos: Array.isArray(lib.photos) ? lib.photos : []
    };
  }
  // Nothing under the new path — take over anything from the old one.
  return migrateLegacy(await fetchBlobJson(LEGACY_PATH));
}

export async function writeLibrary(library: Library): Promise<void> {
  // This SDK version has no allowOverwrite flag, so replace the file.
  const { blobs } = await list({ prefix: LIBRARY_PATH, limit: 1 });
  if (blobs.length) {
    try {
      await del(blobs[0].url);
    } catch {
      /* already gone */
    }
  }
  await put(LIBRARY_PATH, JSON.stringify(library, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0
  });
}

/** Deletes the underlying Blob files for photos being removed. */
export async function deletePhotoFiles(photos: Photo[]): Promise<void> {
  await Promise.all(
    photos.map(async (p) => {
      if (!p.url.startsWith("http")) return;
      try {
        await del(p.url);
      } catch {
        /* file may already be gone — the index is what matters */
      }
    })
  );
}

/** Next order value for a new item in a list. */
export function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.order), -1) + 1;
}
