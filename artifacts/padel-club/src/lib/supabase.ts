import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Supabase in the browser is authentication only: every table is reached through the API. */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
    storageKey: "padel-club-auth",
  },
});
