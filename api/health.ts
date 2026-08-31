import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authConfigured } from "./_lib/auth";

// Diagnostic endpoint: confirms which build is live and whether storage and
// the admin password actually reached this deployment's runtime. Reports
// only booleans — never the values themselves.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    adminConfigured: authConfigured(),
    environment: process.env.VERCEL_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown"
  });
}
