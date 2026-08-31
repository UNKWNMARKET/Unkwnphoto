import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readLibrary, StorageUnavailableError } from "./_lib/store";

// The only endpoint visitors ever hit. Public and read-only: albums and
// photos, sorted, with nothing about the owner in the payload.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const library = await readLibrary();
    library.albums.sort((a, b) => a.order - b.order);
    library.photos.sort((a, b) => a.order - b.order);
    // Serve instantly from the edge, refresh in the background, so publishing
    // a new photo shows up quickly without every visit hitting Blob.
    res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=59");
    return res.status(200).json(library);
  } catch (err) {
    // An outage must not be cached, and must not be dressed up as an empty
    // portfolio — "no albums yet" is a very different claim from "we can't
    // reach storage", and the wrong one would tell visitors his work is gone.
    res.setHeader("Cache-Control", "no-store");
    if (err instanceof StorageUnavailableError) {
      return res.status(503).json({ error: "Photo storage is unreachable right now." });
    }
    return res.status(500).json({ error: "Couldn't load the photos." });
  }
}
