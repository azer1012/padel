import {
  db,
  reservationEquipmentTable,
  reservationPlayersTable,
  reservationsTable,
  type Queryable,
  type Tx,
} from "@workspace/db";
import { and, asc, count, eq, gt, type SQL } from "drizzle-orm";
import { EquipmentError } from "./equipment";
import { HttpError, pgCode } from "./http";
import { moveTokens } from "./ledger";
import { revokeLoyalty } from "./loyalty";
import type { ClubSettings } from "./settings";

// ─── Blocked slots ───────────────────────────────────────────────────────────
// A slot closed by staff (maintenance, private event) is a booking without a member
// whose guest name is the reason in square brackets.

export const blockedGuestName = (reason: string) => `[${reason}]`;

export const isBlockedSlot = (r: { userId: number | null; guestName: string | null }) =>
  r.userId == null && (r.guestName ?? "").startsWith("[");

// ─── Refusals ────────────────────────────────────────────────────────────────

/** Translates the database's refusal of a booking into a clear 4xx answer. */
export function bookingConflict(err: unknown): never {
  if (err instanceof EquipmentError)
    throw new HttpError(
      409,
      `Not enough ${err.itemName} available (${err.available} left)`,
      "EQUIPMENT_UNAVAILABLE",
    );
  const code = pgCode(err);
  // 23P01 = reservations_no_overlap, 23505 = same start already confirmed
  if (code === "23P01" || code === "23505")
    throw new HttpError(409, "This slot was just booked by someone else", "SLOT_TAKEN");
  throw err;
}

// ─── Cancellation policy ─────────────────────────────────────────────────────

/**
 * Players may cancel / leave with a full refund until `cancellationNoticeHours` before
 * the match. After that the club setting decides: 'forbid' (call the club) or
 * 'no_refund' (allowed, but the player's own tokens are not given back).
 * Returns true when the cancellation is late and refund-less. Admins are never limited.
 */
export function lateCancellation(settings: ClubSettings, startTime: Date, now = new Date()) {
  if (startTime <= now)
    throw new HttpError(400, "This match has already started", "CANCELLATION_CLOSED");
  const deadline = startTime.getTime() - settings.cancellationNoticeHours * 3600_000;
  if (now.getTime() < deadline) return false;
  if (settings.lateCancellation === "no_refund") return true;
  throw new HttpError(
    400,
    `Cancellations are possible up to ${settings.cancellationNoticeHours} h before the match. Please call the club.`,
    "CANCELLATION_CLOSED",
    { cancellationNoticeHours: settings.cancellationNoticeHours },
  );
}

// ─── Refunds and removals (always inside the caller's transaction) ───────────

/** Releases the rental gear still reserved for a booking (one player's, or everyone's). */
export async function releaseEquipment(tx: Tx, reservationId: number, userId?: number) {
  await tx
    .update(reservationEquipmentTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(reservationEquipmentTable.reservationId, reservationId),
        eq(reservationEquipmentTable.status, "reserved"),
        ...(userId === undefined ? [] : [eq(reservationEquipmentTable.userId, userId)]),
      ),
    );
}

/**
 * Refunds every token-paid player of a reservation and marks their rows refunded.
 * `keepUserId`: a late 'no_refund' cancellation — that player's tokens stay with the club.
 */
export async function refundPlayers(
  tx: Tx,
  reservationId: number,
  description: string,
  adminId: number | null,
  keepUserId: number | null = null,
) {
  const paid = await tx
    .select()
    .from(reservationPlayersTable)
    .where(
      and(
        eq(reservationPlayersTable.reservationId, reservationId),
        eq(reservationPlayersTable.paymentStatus, "paid"),
        eq(reservationPlayersTable.paymentType, "token"),
      ),
    )
    .orderBy(reservationPlayersTable.userId)
    .for("update");
  const refunds: { userId: number; amount: number }[] = [];
  for (const p of paid) {
    if (p.userId === keepUserId) continue;
    if (p.tokensCharged > 0) {
      await moveTokens(tx, {
        userId: p.userId,
        delta: p.tokensCharged,
        type: "credit",
        reservationId,
        adminId,
        description,
      });
      refunds.push({ userId: p.userId, amount: p.tokensCharged });
    }
    // The tokens come back, so does the loyalty reward they had earned
    await revokeLoyalty(tx, p.userId, p.loyaltyEarned);
    await tx
      .update(reservationPlayersTable)
      .set({ paymentStatus: "refunded", loyaltyEarned: 0 })
      .where(eq(reservationPlayersTable.id, p.id));
  }
  return refunds;
}

/**
 * Takes one player out of a match: deletes the spot, refunds its tokens (unless
 * forfeited by a late leave), releases the gear they reserved, then keeps the booking
 * coherent. If the organiser left, the next player becomes the organiser so somebody
 * can still invite or cancel; a member's match left with nobody is cancelled, which
 * frees the court. Desk bookings for a guest (no member organiser) are left as they are.
 * Returns null when that player is not in the match.
 */
export async function removePlayer(
  tx: Tx,
  reservation: { id: number; userId: number | null },
  who: { playerId: number } | { userId: number },
  opts: { refundDescription: string; adminId?: number | null; forfeit?: boolean },
) {
  // Serializes with joins, other removals and a cancellation of the same match
  await tx
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .where(eq(reservationsTable.id, reservation.id))
    .for("update");

  const [row] = await tx
    .delete(reservationPlayersTable)
    .where(
      and(
        eq(reservationPlayersTable.reservationId, reservation.id),
        "playerId" in who
          ? eq(reservationPlayersTable.id, who.playerId)
          : eq(reservationPlayersTable.userId, who.userId),
      ),
    )
    .returning();
  if (!row) return null;

  const paidTokens =
    row.paymentType === "token" && row.paymentStatus === "paid" ? row.tokensCharged : 0;
  let refunded = 0;
  if (paidTokens > 0 && !opts.forfeit) {
    await moveTokens(tx, {
      userId: row.userId,
      delta: paidTokens,
      type: "credit",
      reservationId: reservation.id,
      adminId: opts.adminId ?? null,
      description: opts.refundDescription,
    });
    refunded = paidTokens;
    await revokeLoyalty(tx, row.userId, row.loyaltyEarned);
  }
  await releaseEquipment(tx, reservation.id, row.userId);

  const [next] = await tx
    .select({ userId: reservationPlayersTable.userId })
    .from(reservationPlayersTable)
    .where(eq(reservationPlayersTable.reservationId, reservation.id))
    .orderBy(asc(reservationPlayersTable.joinedAt))
    .limit(1);
  let freed = false;
  if (!next && reservation.userId != null) {
    await tx
      .update(reservationsTable)
      .set({ status: "cancelled" })
      .where(eq(reservationsTable.id, reservation.id));
    await releaseEquipment(tx, reservation.id);
    freed = true;
  } else if (next && reservation.userId === row.userId) {
    await tx
      .update(reservationsTable)
      .set({ userId: next.userId })
      .where(eq(reservationsTable.id, reservation.id));
  }
  return {
    userId: row.userId,
    refunded,
    refundForfeited: !!opts.forfeit && paidTokens > 0,
    freed,
  };
}

// ─── Counts ──────────────────────────────────────────────────────────────────

/** Confirmed bookings that have not started yet, club-wide or for one court. */
export async function countUpcomingBookings(terrainId?: number, q: Queryable = db) {
  const conditions: SQL[] = [
    eq(reservationsTable.status, "confirmed"),
    gt(reservationsTable.startTime, new Date()),
  ];
  if (terrainId !== undefined) conditions.push(eq(reservationsTable.terrainId, terrainId));
  const [{ n }] = await q
    .select({ n: count() })
    .from(reservationsTable)
    .where(and(...conditions));
  return Number(n);
}
