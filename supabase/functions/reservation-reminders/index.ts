import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { jsonResponse } from "../_shared/cors.ts";

serve(async () => {
  const supabase = createAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, user_id, start_time, terrains(name)")
    .eq("status", "confirmed")
    .gte("start_time", now.toISOString())
    .lte("start_time", soon.toISOString())
    .not("user_id", "is", null);

  if (error) return jsonResponse({ error: error.message }, { status: 400 });

  const notifications = (reservations ?? []).map((reservation) => ({
    user_id: reservation.user_id,
    type: "reservation_reminder",
    title: "Reservation reminder",
    message: `Your reservation starts soon: ${reservation.terrains?.name ?? "court"}.`,
  }));

  if (notifications.length > 0) {
    const { error: insertError } = await supabase.from("notifications").insert(notifications);
    if (insertError) return jsonResponse({ error: insertError.message }, { status: 400 });
  }

  return jsonResponse({ processed: notifications.length });
});

