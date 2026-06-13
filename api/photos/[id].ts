import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del } from "@vercel/blob";
import { readPhotos, writePhotos } from "../_lib/store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id." });
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
