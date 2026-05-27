import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createAdminClient() {
  const url = Deno.env.get("VITE_SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

