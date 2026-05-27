import { supabase } from "@/lib/supabase";

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = await getAccessToken();

  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

