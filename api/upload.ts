import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Issues short-lived client tokens so the browser can upload image files
// straight to Vercel Blob (bypassing the serverless request-size limit).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const body = req.body as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req as unknown as Request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "image/avif"
        ],
        maximumSizeInBytes: 25 * 1024 * 1024,
        addRandomSuffix: true
      }),
      onUploadCompleted: async () => {
        /* metadata is recorded by the client via POST /api/photos */
      }
    });
    return res.status(200).json(result);
  } catch (err) {
    return res
      .status(400)
      .json({ error: (err as Error).message || "Upload authorization failed." });
  }
}
