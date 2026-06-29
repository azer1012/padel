import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type RealtimeTable =
  | "reservations"
  | "reservation_players"
  | "player_invites"
  | "notifications"
  | "token_transactions"
  | "users";

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface RealtimeSubscriptionOptions {
  table: RealtimeTable;
  event?: RealtimeEvent;
  filter?: string;
  onMessage: (payload: any) => void;
  onError?: (error: Error) => void;
}

export function subscribeToRealtimeTable(options: RealtimeSubscriptionOptions): RealtimeChannel {
  const { table, event = "*", filter, onMessage, onError } = options;

  const channel = supabase
    .channel(`public:${table}`)
    .on(
      "postgres_changes",
      {
        event,
        schema: "public",
        table,
        filter,
      },
      onMessage,
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`Subscribed to ${table} changes`);
      } else if (status === "CHANNEL_ERROR") {
        onError?.(new Error(`Failed to subscribe to ${table}`));
      }
    });

  return channel;
}

export async function unsubscribeFromRealtimeTable(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

export function subscribeToUserNotifications(
  userId: number,
  onMessage: (payload: any) => void,
): RealtimeChannel {
  return subscribeToRealtimeTable({
    table: "notifications",
    filter: `user_id=eq.${userId}`,
    onMessage,
  });
}

export function subscribeToReservationUpdates(
  reservationId: number,
  onMessage: (payload: any) => void,
): RealtimeChannel {
  return subscribeToRealtimeTable({
    table: "reservations",
    filter: `id=eq.${reservationId}`,
    onMessage,
  });
}

export function subscribeToTokenUpdates(
  userId: number,
  onMessage: (payload: any) => void,
): RealtimeChannel {
  return subscribeToRealtimeTable({
    table: "token_transactions",
    filter: `user_id=eq.${userId}`,
    onMessage,
  });
}
