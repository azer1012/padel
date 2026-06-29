import { supabase } from "@/lib/supabase";

export const STORAGE_BUCKETS = ["avatars", "clubs", "courts", "tournaments", "gallery"] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function uploadImage(bucket: StorageBucket, path: string, file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported image type");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }

  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: true,
  });

  if (error) throw error;
  return data;
}

export function getPublicImageUrl(bucket: StorageBucket, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

