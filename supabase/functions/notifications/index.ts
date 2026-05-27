import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  const supabase = createAdminClient();
  const { userId, type, title, message } = await req.json();

  if (!userId || !type || !title || !message) {
    return jsonResponse({ error: "Missing notification fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type, title, message })
    .select()
    .single();

  if (error) return jsonResponse({ error: error.message }, { status: 400 });
  return jsonResponse({ notification: data });
});

