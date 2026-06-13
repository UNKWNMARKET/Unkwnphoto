import { del, list, put } from "@vercel/blob";

export interface Photo {
  id: string;
  title: string;
  description: string;
  url: string;
  pathname?: string;
  createdAt: string;
}

// Where the photo metadata index lives inside the Blob store.
const META_PATH = "metadata/photos.json";

// Shown until the owner uploads their own photos (the files live in /public).
export const SAMPLE_PHOTOS: Photo[] = [
  {
    id: "sample-1",
    title: "Event Horizon",
    description:
      "Long exposure over still water — sample image, replace from the Manage page.",
    url: "/samples/nebula.svg",
    createdAt: "2026-01-01T00:00:03.000Z"
  },
  {
    id: "sample-2",
    title: "Quiet Orbit",
    description:
      "Cool tones and negative space — sample image, replace from the Manage page.",
    url: "/samples/aurora.svg",
    createdAt: "2026-01-01T00:00:02.000Z"
  },
  {
    id: "sample-3",
    title: "First Light",
    description:
      "Warm gradient at dawn — sample image, replace from the Manage page.",
    url: "/samples/ember.svg",
    createdAt: "2026-01-01T00:00:01.000Z"
  }
];

export async function readPhotos(): Promise<Photo[]> {
  const { blobs } = await list({ prefix: META_PATH, limit: 1 });
  if (!blobs.length) return [];
  // Cache-bust so we always read the latest index after an overwrite.
  const res = await fetch(`${blobs[0].url}?ts=${Date.now()}`, {
    cache: "no-store"
  });
  if (!res.ok) return [];
  return (await res.json()) as Photo[];
}

export async function writePhotos(photos: Photo[]): Promise<void> {
  // Replace the existing index (this SDK version has no allowOverwrite flag).
  const { blobs } = await list({ prefix: META_PATH, limit: 1 });
  if (blobs.length) {
    try {
      await del(blobs[0].url);
    } catch {
      /* already gone */
    }
  }
  await put(META_PATH, JSON.stringify(photos, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0
  });
}
