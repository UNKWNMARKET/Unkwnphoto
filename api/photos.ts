import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { readPhotos, writePhotos, SAMPLE_PHOTOS, type Photo } from "./_lib/store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const stored = await readPhotos();
      const photos = stored.length ? stored : SAMPLE_PHOTOS;
      photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return res.status(200).json(photos);
    } catch {
      // Blob store not configured yet — still show the samples.
      return res.status(200).json(SAMPLE_PHOTOS);
    }
  }

  if (req.method === "POST") {
    const { title, description, url, pathname } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing uploaded file URL." });
    }
    const photo: Photo = {
      id: randomUUID(),
      title: String(title ?? "").trim() || "Untitled",
      description: String(description ?? "").trim(),
      url,
      pathname: typeof pathname === "string" ? pathname : undefined,
      createdAt: new Date().toISOString()
    };
    try {
      const photos = await readPhotos();
      photos.push(photo);
      await writePhotos(photos);
      return res.status(201).json(photo);
    } catch (err) {
      return res.status(500).json({
        error:
          "Could not save the photo. Make sure a Vercel Blob store is connected to this project."
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}
