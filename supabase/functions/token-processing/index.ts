import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  const supabase = createAdminClient();
  const { userId, amount, type, description, adminId } = await req.json();

  if (!userId || !amount || !type || !description) {
    return jsonResponse({ error: "Missing token processing fields" }, { status: 400 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, token_balance")
    .eq("id", userId)
    .single();

  if (userError) return jsonResponse({ error: userError.message }, { status: 400 });

  const delta = type === "debit" ? -Math.abs(amount) : Math.abs(amount);
  const balanceAfter = Math.max(0, user.token_balance + delta);

  const { error: updateError } = await supabase
    .from("users")
    .update({ token_balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateError) return jsonResponse({ error: updateError.message }, { status: 400 });

  const { data: transaction, error: transactionError } = await supabase
    .from("token_transactions")
    .insert({
      user_id: userId,
      admin_id: adminId ?? null,
      type,
      amount: Math.abs(amount),
      balance_after: balanceAfter,
      description,
    })
    .select()
    .single();

  if (transactionError) return jsonResponse({ error: transactionError.message }, { status: 400 });
  return jsonResponse({ transaction });
});

