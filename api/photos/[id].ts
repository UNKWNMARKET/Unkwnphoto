import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { deletePhotoFiles, nextOrder, readLibrary, writeLibrary } from "../_lib/store";

// PATCH  /api/photos/:id  { title?, albumId? }  rename, or move to another album
// DELETE /api/photos/:id                        remove the photo and its file
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid photo id." });
  }
  if (req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!requireAuth(req, res)) return;

  try {
    const library = await readLibrary();
    const index = library.photos.findIndex((p) => p.id === id);
    if (index < 0) return res.status(404).json({ error: "Photo not found." });
    const photo = library.photos[index];

    if (req.method === "PATCH") {
      const { title, albumId } = (req.body ?? {}) as Record<string, unknown>;

      if (typeof title === "string") {
        photo.title = title.trim().slice(0, 200) || "Untitled";
      }
      if (typeof albumId === "string" && albumId !== photo.albumId) {
        if (!library.albums.some((a) => a.id === albumId)) {
          return res.status(404).json({ error: "Album not found." });
        }
        // Moving out of an album must not leave it pointing at a missing cover.
        const from = library.albums.find((a) => a.id === photo.albumId);
        if (from?.coverPhotoId === photo.id) {
          const replacement = library.photos.find(
            (p) => p.albumId === from.id && p.id !== photo.id
          );
          from.coverPhotoId = replacement?.id;
        }
        photo.albumId = albumId;
        photo.order = nextOrder(library.photos.filter((p) => p.albumId === albumId));
        const to = library.albums.find((a) => a.id === albumId);
        if (to && !to.coverPhotoId) to.coverPhotoId = photo.id;
      }

      await writeLibrary(library);
      return res.status(200).json(photo);
    }

    // DELETE
    library.photos.splice(index, 1);
    const album = library.albums.find((a) => a.id === photo.albumId);
    if (album?.coverPhotoId === photo.id) {
      const replacement = library.photos
        .filter((p) => p.albumId === album.id)
        .sort((a, b) => a.order - b.order)[0];
      album.coverPhotoId = replacement?.id;
    }
    await writeLibrary(library);
    await deletePhotoFiles([photo]);
    return res.status(204).end();
  } catch {
    return res.status(500).json({ error: "Couldn't update the photo." });
  }
}
