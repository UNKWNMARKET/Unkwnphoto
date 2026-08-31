import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authConfigured, isAuthenticated } from "./_lib/auth";

// Diagnostic endpoint. Signed in, it reports whether storage and the admin
// password reached this deployment's runtime, and which commit is live —
// never the values themselves. Signed out it says only that the site is up,
// so it isn't a free fingerprint of the deployment for anyone who asks.
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (!isAuthenticated(req)) {
    // Whether an admin password is configured is what the sign-in page needs
    // in order to explain itself, and it reveals nothing an attacker can use.
    return res.status(200).json({ ok: true, adminConfigured: authConfigured() });
  }

  return res.status(200).json({
    ok: true,
    adminConfigured: true,
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    sessionSecretSet: Boolean(process.env.SESSION_SECRET),
    environment: process.env.VERCEL_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown"
  });
}
