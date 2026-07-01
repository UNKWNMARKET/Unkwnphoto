import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del } from "@vercel/blob";
import { readPhotos, writePhotos } from "../_lib/store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id." });
  }

  // Edit a photo's title / description in place.
  if (req.method === "PATCH") {
    const { title, description } = (req.body ?? {}) as Record<string, unknown>;
    try {
      const photos = await readPhotos();
      const i = photos.findIndex((p) => p.id === id);
      if (i < 0) return res.status(404).json({ error: "Not found." });
      if (typeof title === "string") {
        photos[i].title = title.trim() || "Untitled";
      }
      if (typeof description === "string") {
        photos[i].description = description.trim();
      }
      await writePhotos(photos);
      return res.status(200).json(photos[i]);
    } catch {
      return res.status(500).json({ error: "Could not update the photo." });
    }
  }

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE, PATCH");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const photos = await readPhotos();
    const photo = photos.find((p) => p.id === id);
    if (!photo) return res.status(404).json({ error: "Not found." });

    // Remove the underlying Blob file (samples live in /public, skip those).
    if (photo.url.startsWith("http")) {
      try {
        await del(photo.url);
      } catch {
        /* file may already be gone */
      }
    }
    await writePhotos(photos.filter((p) => p.id !== id));
    return res.status(204).end();
  } catch {
    return res.status(500).json({ error: "Could not delete the photo." });
  }
}
