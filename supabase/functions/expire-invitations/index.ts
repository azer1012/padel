import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { jsonResponse } from "../_shared/cors.ts";

serve(async () => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("player_invites")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) return jsonResponse({ error: error.message }, { status: 400 });
  return jsonResponse({ expired: data?.length ?? 0 });
});

