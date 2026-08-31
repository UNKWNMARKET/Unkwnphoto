import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { requireAuth } from "./_lib/auth";
import {
  loadLibrary,
  nextOrder,
  storageErrorResponse,
  writeLibrary,
  type Album
} from "./_lib/store";

// POST /api/albums { name, description? } -> create a named album. Owner only.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireAuth(req, res)) return;

  const { name, description } = (req.body ?? {}) as Record<string, unknown>;
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return res.status(400).json({ error: "Give the album a name." });
  if (trimmed.length > 120) {
    return res.status(400).json({ error: "That album name is too long." });
  }

  try {
    const { library, etag } = await loadLibrary();
    const album: Album = {
      id: randomUUID(),
      name: trimmed,
      description: String(description ?? "").trim().slice(0, 500),
      order: nextOrder(library.albums),
      createdAt: new Date().toISOString()
    };
    library.albums.push(album);
    await writeLibrary(library, etag);
    return res.status(201).json(album);
  } catch (err) {
    const { status, error } = storageErrorResponse(err);
    return res.status(status).json({ error });
  }
}
