import { supabase } from "@/lib/supabase";

export type StorageBucket = "avatars" | "clubs" | "courts" | "tournaments" | "gallery";

export interface UploadOptions {
  bucket: StorageBucket;
  path: string;
  file: File;
  onProgress?: (progress: number) => void;
}

export async function uploadFile(options: UploadOptions): Promise<string> {
  const { bucket, path, file } = options;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return publicUrl;
}

export async function deleteFile(bucket: StorageBucket, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export async function getPublicUrl(bucket: StorageBucket, path: string): Promise<string> {
  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return publicUrl;
}

export function generateStoragePath(userId: string, filename: string): string {
  return `${userId}/${Date.now()}-${filename}`;
}
