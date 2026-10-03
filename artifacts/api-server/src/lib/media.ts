import crypto from "node:crypto";
import { db, mediaFilesTable, type MediaFile } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { supabaseAdmin } from "../config/supabase";
import { HttpError } from "./http";
import { logger } from "./logger";

/**
 * Photos uploaded by the desk. The files are in one private Supabase Storage bucket:
 * no browser role reads or writes it. The API uploads with its service role and
 * serves the photos itself, so a photo's address never depends on the storage host.
 */
export const MEDIA_BUCKET = "media";
/** Same limit as the bucket's own (the website shrinks a photo well below it first). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** A photo nothing uses is kept this long: the form it was picked for may still be open. */
const UNUSED_AFTER_HOURS = 24;

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type ImageType = keyof typeof TYPES;
const BY_EXTENSION = Object.fromEntries(
  Object.entries(TYPES).map(([type, ext]) => [ext, type]),
) as Record<string, ImageType>;

const KEY = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
export const isMediaKey = (key: string) => KEY.test(key);
/** Where a photo is shown from: what the forms save. */
export const mediaUrl = (key: string) => `/api/media/${key}`;

/**
 * What the bytes really are, whatever the request says they are. Only the three
 * formats every browser draws as a picture: never SVG or HTML, which can carry script.
 */
export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

const files = () => supabaseAdmin.storage.from(MEDIA_BUCKET);

/** Saves an uploaded photo and returns its row. */
export async function storeImage(body: unknown, uploadedBy: number): Promise<MediaFile> {
  if (!Buffer.isBuffer(body) || body.length === 0)
    throw new HttpError(400, "Send the photo itself as the request body", "UNSUPPORTED_IMAGE");
  if (body.length > MAX_IMAGE_BYTES)
    throw new HttpError(413, "The photo is too large (5 MB at most)", "IMAGE_TOO_LARGE");
  const contentType = sniffImage(body);
  if (!contentType)
    throw new HttpError(400, "The photo must be a JPEG, PNG or WebP image", "UNSUPPORTED_IMAGE");

  const key = `${crypto.randomBytes(16).toString("hex")}.${TYPES[contentType]}`;
  let failure: unknown;
  try {
    const { error } = await files().upload(key, body, { contentType, upsert: false });
    failure = error;
  } catch (err) {
    failure = err;
  }
  if (failure) {
    logger.error({ err: failure }, "photo upload failed");
    throw new HttpError(502, "The photo could not be saved. Try again.", "STORAGE_ERROR");
  }
  try {
    const [row] = await db
      .insert(mediaFilesTable)
      .values({ key, contentType, bytes: body.length, uploadedBy })
      .returning();
    return row;
  } catch (err) {
    // Never a file in the bucket that the database does not know
    await files()
      .remove([key])
      .catch(() => undefined);
    throw err;
  }
}

/** The bytes of a photo, or null when there is no such photo. */
export async function readImage(key: string) {
  if (!isMediaKey(key)) return null;
  try {
    const { data, error } = await files().download(key);
    if (error || !data) return null;
    return {
      body: Buffer.from(await data.arrayBuffer()),
      contentType: BY_EXTENSION[key.slice(key.lastIndexOf(".") + 1)],
    };
  } catch (err) {
    logger.warn({ err, key }, "photo download failed");
    return null;
  }
}

/**
 * Removes the photos nothing shows any more: uploaded then never saved, or replaced
 * since. Called by the scheduled jobs. A photo is in use when a court, an article of
 * the news, a tournament or a boutique article holds its address.
 */
export async function sweepMedia(now = new Date()) {
  const before = new Date(now.getTime() - UNUSED_AFTER_HOURS * 3600 * 1000);
  const { rows } = await db.execute<{ id: number; key: string }>(sql`
    select m.id, m.key
      from media_files m
     where m.created_at < ${before}
       and not exists (select 1 from news n where n.image_url = '/api/media/' || m.key)
       and not exists (select 1 from tournaments t where t.image_url = '/api/media/' || m.key)
       and not exists (select 1 from shop_products p where ('/api/media/' || m.key) = any (p.image_urls))
       and not exists (select 1 from terrains c where ('/api/media/' || m.key) = any (c.photos))
     order by m.id
     limit 200`);
  if (!rows.length) return 0;
  const { error } = await files().remove(rows.map((r) => r.key));
  if (error) {
    // Kept for the next run: the rows still say which files to remove
    logger.warn({ err: error }, "unused photos could not be removed");
    return 0;
  }
  await db.delete(mediaFilesTable).where(
    inArray(
      mediaFilesTable.id,
      rows.map((r) => r.id),
    ),
  );
  return rows.length;
}
