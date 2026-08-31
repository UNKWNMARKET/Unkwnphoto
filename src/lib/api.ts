import { upload } from "@vercel/blob/client";
import type { Album, Library, Photo } from "../types";

const EMPTY: Library = { version: 2, albums: [], photos: [] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || "Something went wrong. Try again.");
  }
  return data as T;
}

/* ---------- public ---------- */

export async function getLibrary(): Promise<Library> {
  try {
    return await request<Library>("/api/library");
  } catch {
    // No backend (e.g. a static preview) — show an empty portfolio rather
    // than an error page.
    return EMPTY;
  }
}

/* ---------- session ---------- */

export interface SessionState {
  authenticated: boolean;
  configured: boolean;
}

export async function getSession(): Promise<SessionState> {
  try {
    return await request<SessionState>("/api/auth");
  } catch {
    return { authenticated: false, configured: false };
  }
}

export function login(password: string): Promise<SessionState> {
  return request<SessionState>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", password })
  });
}

export function logout(): Promise<SessionState> {
  return request<SessionState>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "logout" })
  });
}

/* ---------- albums (owner only) ---------- */

export function createAlbum(name: string): Promise<Album> {
  return request<Album>("/api/albums", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function updateAlbum(
  id: string,
  patch: Partial<Pick<Album, "name" | "description" | "coverPhotoId" | "order">>
): Promise<Album> {
  return request<Album>(`/api/albums/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export function deleteAlbum(id: string): Promise<void> {
  return request<void>(`/api/albums/${id}`, { method: "DELETE" });
}

/* ---------- photos (owner only) ---------- */

export function updatePhoto(
  id: string,
  patch: Partial<Pick<Photo, "title" | "albumId">>
): Promise<Photo> {
  return request<Photo>(`/api/photos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export function deletePhoto(id: string): Promise<void> {
  return request<void>(`/api/photos/${id}`, { method: "DELETE" });
}

export function reorderPhotos(albumId: string, order: string[]): Promise<void> {
  return request<void>("/api/photos", {
    method: "PATCH",
    body: JSON.stringify({ albumId, order })
  });
}

/** "DSC03625.jpeg" -> "Dsc03625", "old-truck_1.jpg" -> "Old Truck 1" */
export function titleFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  const words = stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Untitled";
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Reads a file's pixel dimensions so the grid can reserve the right space. */
function measure(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

export interface UploadResult {
  added: Photo[];
  failed: string[];
}

/**
 * Uploads files straight to Blob storage, then registers the whole batch in a
 * single API call. Registering one-by-one would race: the index is one JSON
 * file, so concurrent read-modify-write cycles would drop photos.
 */
export async function uploadPhotos(
  albumId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<UploadResult> {
  const failed: string[] = [];
  const items: {
    title: string;
    url: string;
    pathname: string;
    width?: number;
    height?: number;
  }[] = [];

  let done = 0;
  onProgress?.(0, files.length);

  // Sequential keeps a phone's connection and memory sane, and gives honest
  // progress. Photo files are big; six parallel 20 MB uploads is not a favour.
  for (const file of files) {
    try {
      const dimensions = await measure(file);
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blob = await upload(`photos/${Date.now()}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: file.type || undefined
      });
      items.push({
        title: titleFromFilename(file.name),
        url: blob.url,
        pathname: blob.pathname,
        ...dimensions
      });
    } catch {
      failed.push(file.name);
    }
    onProgress?.(++done, files.length);
  }

  if (!items.length) return { added: [], failed };

  const added = await request<Photo[]>("/api/photos", {
    method: "POST",
    body: JSON.stringify({ albumId, items })
  });
  return { added, failed };
}
