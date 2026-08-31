import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAuthenticated, authConfigured } from "./_lib/auth";

// Issues short-lived client tokens so the browser can upload image files
// straight to Vercel Blob, bypassing the 4.5 MB serverless body limit.
//
// This endpoint is the keys to the storage bucket: anyone who can call it can
// write files into the owner's Blob store and run up his bill. It is gated on
// the session cookie, and the check happens inside onBeforeGenerateToken as
// well as up front, so no token is ever minted for an anonymous caller.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!authConfigured()) {
    return res.status(503).json({
      error:
        "Admin access isn't configured yet. Add an ADMIN_PASSWORD environment variable in the Vercel project settings, then redeploy."
    });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Please sign in." });
  }

  try {
    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => {
        // Belt and braces: this callback also runs for the token-exchange leg
        // of the handshake, so re-assert the session here too.
        if (!isAuthenticated(req)) throw new Error("Please sign in.");
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/avif"
          ],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true
        };
      },
      onUploadCompleted: async () => {
        /* the client registers metadata in one batch via POST /api/photos */
      }
    });
    return res.status(200).json(result);
  } catch (err) {
    return res
      .status(400)
      .json({ error: (err as Error).message || "Upload authorization failed." });
  }
}
