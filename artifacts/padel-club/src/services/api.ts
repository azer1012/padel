import { supabase } from "@/lib/supabase";

/** Access token of the signed-in member, attached by the API client to every request. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Optional API origin when the API isn't served under the site's own /api path. */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(
  /\/+$/,
  "",
);

/**
 * Address to show a photo from. An uploaded photo is saved as "/api/media/<name>": it
 * is served by the API, which may be on another address than the website. A link or a
 * file of the site itself is used as it is.
 */
export function mediaSrc(url: string): string;
export function mediaSrc(url: string | null | undefined): string | undefined;
export function mediaSrc(url: string | null | undefined) {
  if (!url) return undefined;
  return url.startsWith("/api/media/") ? `${API_BASE}${url}` : url;
}
