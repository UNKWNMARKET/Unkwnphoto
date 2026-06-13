import type { VercelRequest, VercelResponse } from "@vercel/node";

// Diagnostic endpoint: confirms which build is live and whether the Blob
// storage token actually reached this deployment's runtime.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    environment: process.env.VERCEL_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown"
  });
}
