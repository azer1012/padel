import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { installDemo } from "./demo";

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
    storageKey: "padel-club-auth",
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// No-op unless built with VITE_DEMO=true (see lib/demo.ts).
installDemo(supabase);
