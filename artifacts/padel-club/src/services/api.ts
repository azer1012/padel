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
