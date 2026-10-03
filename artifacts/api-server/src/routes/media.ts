import express, { Router } from "express";
import { currentUser, requireAdmin } from "../lib/auth";
import { assertNotDemo } from "../lib/demo";
import { HttpError } from "../lib/http";
import { MAX_IMAGE_BYTES, mediaUrl, readImage, storeImage } from "../lib/media";

const router = Router();

/**
 * Upload of one photo by the desk: the request body is the file itself. Answers with
 * the address to save in the form (a court, an article, a tournament, a boutique
 * article). What the bytes are is decided here, never by the request's Content-Type.
 */
router.post(
  "/admin/media",
  requireAdmin,
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    // The demo's club is shared by every visitor: no file of theirs is kept
    assertNotDemo("Uploading photos");
    const file = await storeImage(req.body, currentUser(req).id);
    res.status(201).json({
      key: file.key,
      url: mediaUrl(file.key),
      contentType: file.contentType,
      bytes: file.bytes,
    });
  },
);

/**
 * A photo, for everybody: the pages that show it are public. The name is random and
 * never reused, so browsers and caches may keep the file for good.
 */
router.get("/media/:key", async (req, res) => {
  const photo = await readImage(String(req.params.key));
  if (!photo) throw new HttpError(404, "Photo not found", "NOT_FOUND");
  res.setHeader("Content-Type", photo.contentType);
  res.setHeader("Content-Length", String(photo.body.length));
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  // Shown by the website even when the API is on another address
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.end(photo.body);
});

export default router;
