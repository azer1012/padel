import { supabase } from "@/lib/supabase";

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Optional API origin when the API isn't served under the site's own /api path. */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(
  /\/+$/,
  "",
);

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (API_BASE && typeof input === "string" && input.startsWith("/")) input = API_BASE + input;
  const headers = new Headers(init.headers);
  const token = await getAccessToken();

  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
