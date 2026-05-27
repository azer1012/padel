import { supabase } from "@/lib/supabase";

type RealtimeHandler<T = Record<string, unknown>> = (payload: T) => void;

export function subscribeToBookingUpdates(handler: RealtimeHandler) {
  return supabase
    .channel("booking-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, handler)
    .on("postgres_changes", { event: "*", schema: "public", table: "reservation_players" }, handler)
    .subscribe();
}

export function subscribeToOpenMatches(handler: RealtimeHandler) {
  return supabase
    .channel("open-matches")
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: "is_public=eq.true" }, handler)
    .subscribe();
}

export function subscribeToNotifications(userId: number, handler: RealtimeHandler) {
  return supabase
    .channel(`notifications:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, handler)
    .subscribe();
}

export function subscribeToInvitationUpdates(handler: RealtimeHandler) {
  return supabase
    .channel("invitation-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "player_invites" }, handler)
    .subscribe();
}

export function subscribeToTokenBalance(userId: number, handler: RealtimeHandler) {
  return supabase
    .channel(`token-balance:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "users", filter: `id=eq.${userId}` }, handler)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "token_transactions", filter: `user_id=eq.${userId}` }, handler)
    .subscribe();
}

