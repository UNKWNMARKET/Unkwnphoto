import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { requireAuth } from "./_lib/auth";
import { nextOrder, readLibrary, writeLibrary, type Photo } from "./_lib/store";

interface IncomingPhoto {
  title?: unknown;
  url?: unknown;
  pathname?: unknown;
  width?: unknown;
  height?: unknown;
}

const MAX_BATCH = 200;

// POST  /api/photos  { albumId, items: [...] }   register an upload batch
// PATCH /api/photos  { albumId, order: [ids] }   reorder an album in one write
//
// Registering a whole batch in ONE request is deliberate. The index is a
// single JSON file, so N parallel requests each doing read-modify-write would
// race and silently drop photos. The browser uploads the files concurrently,
// then records them all here in a single atomic rewrite.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireAuth(req, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const albumId = typeof body.albumId === "string" ? body.albumId : "";
  if (!albumId) return res.status(400).json({ error: "Missing album." });

  try {
    const library = await readLibrary();
    if (!library.albums.some((a) => a.id === albumId)) {
      return res.status(404).json({ error: "Album not found." });
    }

    if (req.method === "PATCH") {
      const order = Array.isArray(body.order) ? body.order : null;
      if (!order) return res.status(400).json({ error: "Missing order." });
      const position = new Map<string, number>();
      order.forEach((photoId, i) => {
        if (typeof photoId === "string") position.set(photoId, i);
      });
      for (const photo of library.photos) {
        if (photo.albumId !== albumId) continue;
        const next = position.get(photo.id);
        if (next !== undefined) photo.order = next;
      }
      await writeLibrary(library);
      return res.status(200).json({ ok: true });
    }

    const items = Array.isArray(body.items) ? (body.items as IncomingPhoto[]) : [];
    if (!items.length) return res.status(400).json({ error: "No photos to add." });
    if (items.length > MAX_BATCH) {
      return res
        .status(400)
        .json({ error: `That's more than ${MAX_BATCH} photos at once — add them in batches.` });
    }

    let order = nextOrder(library.photos.filter((p) => p.albumId === albumId));
    const added: Photo[] = [];
    for (const item of items) {
      // Only accept Blob URLs this deployment could have produced.
      if (typeof item.url !== "string" || !item.url.startsWith("https://")) continue;
      added.push({
        id: randomUUID(),
        albumId,
        title: String(item.title ?? "").trim().slice(0, 200) || "Untitled",
        url: item.url,
        pathname: typeof item.pathname === "string" ? item.pathname : undefined,
        width: typeof item.width === "number" ? item.width : undefined,
        height: typeof item.height === "number" ? item.height : undefined,
        order: order++,
        createdAt: new Date().toISOString()
      });
    }
    if (!added.length) return res.status(400).json({ error: "No valid photos to add." });

    library.photos.push(...added);

    // First photo into an empty album becomes its cover automatically.
    const album = library.albums.find((a) => a.id === albumId);
    if (album && !album.coverPhotoId) album.coverPhotoId = added[0].id;

    await writeLibrary(library);
    return res.status(201).json(added);
  } catch {
    return res.status(500).json({
      error:
        "Couldn't save those photos. Check that a Vercel Blob store is connected to this project."
    });
  }
}
