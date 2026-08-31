import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import {
  deletePhotoFiles,
  loadLibrary,
  storageErrorResponse,
  writeLibrary
} from "../_lib/store";

// PATCH  /api/albums/:id  { name?, description?, coverPhotoId?, order? }
// DELETE /api/albums/:id  — also removes the album's photos and their files.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid album id." });
  }
  if (req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireAuth(req, res)) return;

  try {
    const { library, etag } = await loadLibrary();
    const index = library.albums.findIndex((a) => a.id === id);
    if (index < 0) return res.status(404).json({ error: "Album not found." });

    if (req.method === "PATCH") {
      const { name, description, coverPhotoId, order } = (req.body ?? {}) as Record<
        string,
        unknown
      >;
      const album = library.albums[index];

      if (typeof name === "string") {
        const trimmed = name.trim();
        if (!trimmed) return res.status(400).json({ error: "Give the album a name." });
        album.name = trimmed.slice(0, 120);
      }
      if (typeof description === "string") {
        album.description = description.trim().slice(0, 500);
      }
      if (typeof coverPhotoId === "string") {
        // Only allow a cover that actually lives in this album.
        const belongs = library.photos.some(
          (p) => p.id === coverPhotoId && p.albumId === id
        );
        if (!belongs) {
          return res.status(400).json({ error: "That photo isn't in this album." });
        }
        album.coverPhotoId = coverPhotoId;
      }
      if (typeof order === "number" && Number.isFinite(order)) {
        album.order = order;
      }

      await writeLibrary(library, etag);
      return res.status(200).json(album);
    }

    // DELETE — take the album's photos with it.
    const doomed = library.photos.filter((p) => p.albumId === id);
    library.albums.splice(index, 1);
    library.photos = library.photos.filter((p) => p.albumId !== id);
    // Write the index first: if file deletion half-fails we're left with
    // orphaned blobs rather than photos pointing at files that are gone.
    await writeLibrary(library, etag);
    await deletePhotoFiles(doomed);
    return res.status(204).end();
  } catch (err) {
    const { status, error } = storageErrorResponse(err);
    return res.status(status).json({ error });
  }
}
