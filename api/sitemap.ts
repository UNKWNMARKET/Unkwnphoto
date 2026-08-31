import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readLibrary } from "./_lib/store";

// Served at /sitemap.xml via a rewrite. Lists the home page and every album,
// so search engines find album pages without having to execute the app's
// JavaScript to discover the links.
function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Build absolute URLs from the host actually being served, so this stays
  // correct on the vercel.app domain and on the custom one.
  const host = req.headers.host ?? "unkwnphoto.com";
  const origin = `https://${host}`;

  let entries: { loc: string; lastmod?: string }[] = [{ loc: `${origin}/` }];
  try {
    const library = await readLibrary();
    const newestIn = (albumId: string) =>
      library.photos
        .filter((p) => p.albumId === albumId)
        .map((p) => p.createdAt)
        .sort()
        .pop();
    entries = entries.concat(
      library.albums
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((a) => ({
          loc: `${origin}/a/${encodeURIComponent(a.id)}`,
          lastmod: newestIn(a.id) ?? a.createdAt
        }))
    );
  } catch {
    // Storage unreachable — still serve a valid sitemap with the home page
    // rather than a 500, which search engines treat as a persistent fault.
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `  <url><loc>${escapeXml(e.loc)}</loc>` +
          (e.lastmod ? `<lastmod>${escapeXml(e.lastmod.slice(0, 10))}</lastmod>` : "") +
          `</url>`
      )
      .join("\n") +
    `\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
}
