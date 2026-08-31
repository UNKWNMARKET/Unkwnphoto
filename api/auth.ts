import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  authConfigured,
  clearSession,
  isAuthenticated,
  issueSession,
  passwordMatches
} from "./_lib/auth";

// One function handling the whole session lifecycle, to stay well inside
// Vercel's per-deployment function limit.
//   GET  /api/auth                      -> { authenticated, configured }
//   POST /api/auth { action: "login" }  -> sets the session cookie
//   POST /api/auth { action: "logout" } -> clears it
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(200).json({
      authenticated: isAuthenticated(req),
      configured: authConfigured()
    });
  }

  if (req.method === "POST") {
    const { action, password } = (req.body ?? {}) as Record<string, unknown>;

    if (action === "logout") {
      clearSession(res);
      return res.status(200).json({ authenticated: false });
    }

    if (action === "login") {
      if (!authConfigured()) {
        return res.status(503).json({
          error:
            "Admin access isn't configured yet. Add an ADMIN_PASSWORD environment variable in the Vercel project settings, then redeploy."
        });
      }
      if (!passwordMatches(password)) {
        // Same message and shape whether the password was empty or simply
        // wrong — nothing here should help someone guess.
        return res.status(401).json({ error: "That password isn't right." });
      }
      issueSession(res);
      return res.status(200).json({ authenticated: true });
    }

    return res.status(400).json({ error: "Unknown action." });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}
