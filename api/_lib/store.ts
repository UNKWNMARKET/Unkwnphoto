import { BlobNotFoundError, del, head, put } from "@vercel/blob";

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

/**
 * A library plus the ETag it was read at. Passing the tag back to
 * writeLibrary makes the write conditional, so two overlapping edits can't
 * silently overwrite each other — the loser is told to retry instead.
 */
export interface LoadedLibrary {
  library: Library;
  etag: string | null;
}

const LIBRARY_PATH = "metadata/library.json";
// The pre-albums schema: a flat Photo[] with no albumId.
const LEGACY_PATH = "metadata/photos.json";

export const EMPTY_LIBRARY: Library = { version: 2, albums: [], photos: [] };

/** Thrown when storage is unreachable, as opposed to simply empty. */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Storage is unavailable.");
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

/** Raised when someone else changed the library since we read it. */
export class ConcurrentEditError extends Error {
  constructor() {
    super("The library changed while you were editing it.");
    this.name = "ConcurrentEditError";
  }
}

interface BlobRead {
  json: unknown;
  etag: string;
}

/**
 * Reads one JSON blob. Returns null only when the blob genuinely does not
 * exist; every other failure throws. That distinction matters enormously:
 * treating a transient read failure as "empty library" would let the very
 * next write persist that emptiness and destroy the whole portfolio.
 */
async function readBlobJson(pathname: string): Promise<BlobRead | null> {
  let meta;
  try {
    meta = await head(pathname);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw new StorageUnavailableError(err);
  }
  if (!meta) return null;

  let res: Response;
  try {
    // Blob URLs are CDN-cached; the ETag busts it so we never act on a stale
    // index, and never mistake a cached copy for the current one.
    res = await fetch(`${meta.url}?v=${encodeURIComponent(meta.etag)}`, {
      headers: { "cache-control": "no-cache" }
    });
  } catch (err) {
    throw new StorageUnavailableError(err);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new StorageUnavailableError(new Error(`HTTP ${res.status}`));

  try {
    return { json: await res.json(), etag: meta.etag };
  } catch (err) {
    // The file exists but isn't valid JSON. Refuse to guess — returning an
    // empty library here would let the next write erase the real one.
    throw new StorageUnavailableError(err);
  }
}

/**
 * Adopts photos saved under the old flat schema into a starter album.
 * Non-destructive: the legacy file is left untouched, so nothing is lost if
 * this runs against an unexpected shape.
 */
function migrateLegacy(rows: unknown): Library {
  if (!Array.isArray(rows) || rows.length === 0) return structuredClone(EMPTY_LIBRARY);
  const album: Album = {
    id: "legacy-selected-work",
    name: "Selected Work",
    description: "",
    order: 0,
    createdAt: new Date().toISOString()
  };
  const photos: Photo[] = rows
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.url === "string" && (r.url as string).startsWith("https://"))
    .map((r, i) => ({
      id: typeof r.id === "string" ? r.id : `legacy-${i}`,
      albumId: album.id,
      title: typeof r.title === "string" && r.title.trim() ? r.title : "Untitled",
      url: r.url as string,
      pathname: typeof r.pathname === "string" ? r.pathname : undefined,
      order: i,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString()
    }));
  if (!photos.length) return structuredClone(EMPTY_LIBRARY);
  album.coverPhotoId = photos[0].id;
  return { version: 2, albums: [album], photos };
}

function coerceLibrary(json: unknown): Library {
  const lib = (json ?? {}) as Partial<Library>;
  return {
    version: 2,
    albums: Array.isArray(lib.albums) ? lib.albums : [],
    photos: Array.isArray(lib.photos) ? lib.photos : []
  };
}

/** Reads the library along with the ETag needed for a safe write. */
export async function loadLibrary(): Promise<LoadedLibrary> {
  const current = await readBlobJson(LIBRARY_PATH);
  if (current) {
    return { library: coerceLibrary(current.json), etag: current.etag };
  }
  // Nothing under the new path — adopt anything left under the old one.
  const legacy = await readBlobJson(LEGACY_PATH);
  return { library: migrateLegacy(legacy?.json), etag: null };
}

/** Convenience for read-only callers that will never write back. */
export async function readLibrary(): Promise<Library> {
  return (await loadLibrary()).library;
}

/**
 * Writes the library in a single atomic overwrite.
 *
 * `ifMatch` makes the write conditional on nobody else having changed the
 * file since it was read; `ifNoneMatch: "*"` is the equivalent guard for
 * creating it for the first time. Either way there is never a moment when
 * the index does not exist — the previous del-then-put left a window where
 * a crash destroyed the entire portfolio.
 */
export async function writeLibrary(library: Library, etag: string | null): Promise<void> {
  try {
    await put(LIBRARY_PATH, JSON.stringify(library, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
      allowOverwrite: true,
      ...(etag ? { ifMatch: etag } : { ifNoneMatch: "*" })
    });
  } catch (err) {
    // A precondition failure means someone else got there first.
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? "";
    if (status === 412 || status === 409 || /precondition|conflict|etag/i.test(message)) {
      throw new ConcurrentEditError();
    }
    throw err;
  }
}

/** Deletes the underlying Blob files for photos being removed. */
export async function deletePhotoFiles(photos: Photo[]): Promise<void> {
  await Promise.all(
    photos.map(async (p) => {
      if (!p.url.startsWith("https://")) return;
      try {
        await del(p.url);
      } catch {
        // The index is already updated, so the photo is gone from the site.
        // A file we couldn't remove is wasted storage, not a broken page.
      }
    })
  );
}

/** Next order value for a new item in a list. */
export function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.order), -1) + 1;
}

/** Renumbers an album's photos 0..n-1 so no two ever share a position. */
export function renumber(photos: Photo[], albumId: string): void {
  photos
    .filter((p) => p.albumId === albumId)
    .sort((a, b) => a.order - b.order)
    .forEach((p, i) => {
      p.order = i;
    });
}

/** Maps a storage failure onto the right HTTP status and message. */
export function storageErrorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof ConcurrentEditError) {
    return { status: 409, error: "Something else changed your photos just now — reload and try again." };
  }
  if (err instanceof StorageUnavailableError) {
    return { status: 503, error: "Photo storage is unreachable right now. Nothing was changed — try again shortly." };
  }
  return {
    status: 500,
    error: "Couldn't save that. Check that a Vercel Blob store is connected to this project."
  };
}
