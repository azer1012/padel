import { usersTable, type Tx } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { moveTokens } from "./ledger";
import type { ClubSettings } from "./settings";

/**
 * Fidélité. The club's rule (Réglages) is "every `loyaltySpendTokens` tokens spent on
 * a booking earn `loyaltyRewardTokens` tokens", for example 1 token → 0.1 token.
 *
 * Token balances are whole numbers, so the fractions add up in
 * `users.loyalty_balance`; each time it reaches a whole token, that token is credited
 * to the wallet through the ledger like any other credit. A refunded booking takes
 * its reward back, which may leave the loyalty balance below zero until the next
 * rewards fill it: booking and cancelling never earns anything.
 */

/** Amounts are kept to the cent of a token. */
const cents = (n: number) => Math.round(n * 100);

/** What spending `tokensSpent` on a booking earns under the club's rule (0 when off). */
export function loyaltyFor(settings: ClubSettings, tokensSpent: number): number {
  if (!settings.loyaltyEnabled || tokensSpent <= 0) return 0;
  return (
    Math.round((tokensSpent * cents(settings.loyaltyRewardTokens)) / settings.loyaltySpendTokens) /
    100
  );
}

/**
 * Adds a reward to a member's loyalty balance and turns every whole token of it into
 * a real token. Runs inside the caller's transaction, after the booking's own debit.
 * Returns the tokens credited to the wallet (0 most of the time).
 */
export async function earnLoyalty(
  tx: Tx,
  m: { userId: number; earned: number; reservationId?: number | null },
): Promise<number> {
  if (m.earned <= 0) return 0;
  const [user] = await tx
    .select({ loyaltyBalance: usersTable.loyaltyBalance })
    .from(usersTable)
    .where(eq(usersTable.id, m.userId))
    // Same lock as the wallet (lib/ledger): two bookings of one member add up, in turn
    .for("no key update");
  if (!user) return 0;
  const total = cents(user.loyaltyBalance) + cents(m.earned);
  const whole = total >= 100 ? Math.floor(total / 100) : 0;
  if (whole > 0)
    await moveTokens(tx, {
      userId: m.userId,
      delta: whole,
      type: "credit",
      reservationId: m.reservationId ?? null,
      description: "Loyalty reward",
    });
  await tx
    .update(usersTable)
    .set({ loyaltyBalance: (total - whole * 100) / 100 })
    .where(eq(usersTable.id, m.userId));
  return whole;
}

/** Takes back the reward of a refunded spot (inside the caller's transaction). */
export async function revokeLoyalty(tx: Tx, userId: number, earned: number) {
  if (earned <= 0) return;
  await tx
    .update(usersTable)
    .set({ loyaltyBalance: sql`${usersTable.loyaltyBalance} - ${earned}` })
    .where(eq(usersTable.id, userId));
}
