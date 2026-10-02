import { tokenTransactionsTable, usersTable, type Tx } from "@workspace/db";
import { eq } from "drizzle-orm";
import { HttpError } from "./http";

type Movement = {
  userId: number;
  /** Signed change: negative = tokens leave the wallet. */
  delta: number;
  type: "credit" | "debit" | "adjustment";
  description: string;
  reservationId?: number | null;
  adminId?: number | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  /** Cash received at the desk for a credit (accounting). */
  cashAmount?: number | null;
  packageId?: number | null;
};

/**
 * The only way a token balance changes. Must run inside a transaction:
 * locks the wallet row, refuses to go below zero, updates the balance and writes
 * the matching ledger entry. The database independently checks at commit that
 * the final balance equals the last ledger entry (users_token_balance_ledger).
 */
export async function moveTokens(tx: Tx, m: Movement) {
  const [user] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, m.userId))
    // NO KEY UPDATE, not UPDATE: rows inserted earlier in the transaction (a booking,
    // a spot) already hold a key-share lock on this member through their foreign key.
    // A full row lock would deadlock two simultaneous operations of the same member.
    .for("no key update");
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const balanceAfter = user.tokenBalance + m.delta;
  if (balanceAfter < 0) {
    throw new HttpError(
      400,
      m.type === "debit" && !m.adminId ? "Insufficient tokens" : "Balance cannot go below zero",
      "INSUFFICIENT_TOKENS",
      { balance: user.tokenBalance, needed: -m.delta },
    );
  }

  await tx
    .update(usersTable)
    .set({ tokenBalance: balanceAfter, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const [row] = await tx
    .insert(tokenTransactionsTable)
    .values({
      userId: user.id,
      adminId: m.adminId ?? null,
      reservationId: m.reservationId ?? null,
      type: m.type,
      amount: Math.abs(m.delta),
      balanceAfter,
      description: m.description,
      notes: m.notes ?? null,
      idempotencyKey: m.idempotencyKey ?? null,
      cashAmount: m.cashAmount ?? null,
      packageId: m.packageId ?? null,
    })
    .returning();

  return { user, balanceBefore: user.tokenBalance, balanceAfter, row };
}
