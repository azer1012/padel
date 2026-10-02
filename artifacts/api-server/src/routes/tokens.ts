import { Router } from "express";
import {
  db,
  tokenTransactionsTable,
  tokenPackagesTable,
  usersTable,
  activityTable,
} from "@workspace/db";
import { eq, desc, count, and, sql, type SQL } from "drizzle-orm";
import { currentUser, requireUser, requireAdmin } from "../lib/auth";
import { fullName } from "../lib/members";
import { notifyLater } from "../lib/notify";
import { formatClubDate } from "../lib/club-time";
import { moveTokens } from "../lib/ledger";
import { getSettings } from "../lib/settings";
import { HttpError, cleanText, oneOf, paging, pgCode, requireId, toId } from "../lib/http";

const router = Router();

router.get("/tokens/balance", requireUser, async (req, res) => {
  const user = currentUser(req);
  res.json({
    userId: user.id,
    balance: user.tokenBalance,
    pendingExpiry: null,
    nextExpiryDate: null,
  });
});

router.get("/tokens/transactions", requireUser, async (req, res) => {
  const user = currentUser(req);
  const { page, limit, offset } = paging(req.query as Record<string, string>, 20, 100);
  const where = eq(tokenTransactionsTable.userId, user.id);
  const [{ total }] = await db.select({ total: count() }).from(tokenTransactionsTable).where(where);
  const data = await db.query.tokenTransactionsTable.findMany({
    where,
    orderBy: [desc(tokenTransactionsTable.createdAt), desc(tokenTransactionsTable.id)],
    limit,
    offset,
  });
  res.json({ data, total: Number(total), page, limit });
});

/**
 * Admin wallet operations (cash paid at the desk → tokens):
 *   packageId: sells a pack (tokens and price from token_packages; price editable for a discount)
 *   cashAmount: cash received for a credit, stored in the ledger for the accounting
 *   credit: balance + amount · debit: balance − amount (never below zero)
 *   adjustment: sets the balance to `amount` exactly (the ledger stores the real delta).
 * `idempotencyKey` (one per dialog) makes a double click or a retried request harmless.
 */
router.post("/tokens/admin/adjust", requireAdmin, async (req, res) => {
  const admin = currentUser(req);
  const b = req.body ?? {};
  const userId = requireId(b.userId, "member");
  const type = oneOf(b.type, ["credit", "debit", "adjustment"] as const);
  let amount = Number(b.amount);
  let description = cleanText(b.description, 200);
  let cashAmount: number | null = null;
  let packageId: number | null = null;
  if (b.packageId !== undefined && b.packageId !== null && b.packageId !== "") {
    if (type !== "credit")
      throw new HttpError(400, "A pack can only be sold as a credit", "VALIDATION_ERROR");
    packageId = requireId(b.packageId, "package");
    const [pack] = await db
      .select()
      .from(tokenPackagesTable)
      .where(eq(tokenPackagesTable.id, packageId));
    if (!pack || !pack.isActive)
      throw new HttpError(400, "This pack is not on sale", "PACKAGE_UNAVAILABLE");
    amount = pack.tokens;
    cashAmount = pack.price;
    description ??= `${pack.name} (${pack.tokens} tokens)`;
  }
  if (b.cashAmount !== undefined && b.cashAmount !== null && b.cashAmount !== "") {
    const c = Number(b.cashAmount);
    if (type !== "credit" || !Number.isFinite(c) || c < 0 || c > 1_000_000)
      throw new HttpError(400, "Invalid cash amount", "VALIDATION_ERROR");
    cashAmount = Math.round(c * 100) / 100;
  }
  const notes = cleanText(b.notes, 500);
  const idempotencyKey = cleanText(b.idempotencyKey, 100);
  if (!type) throw new HttpError(400, "Invalid type", "VALIDATION_ERROR");
  if (
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > 1000 ||
    (type !== "adjustment" && amount === 0)
  )
    throw new HttpError(
      400,
      "Amount must be a whole number between 1 and 1000",
      "VALIDATION_ERROR",
    );
  if (!description) throw new HttpError(400, "A reason is required", "VALIDATION_ERROR");
  if (cashAmount !== null && packageId === null) {
    // A sale (cash received): the club's minimum purchase applies; gifts and refunds don't
    const { tokenMinPurchase } = await getSettings();
    if (amount < tokenMinPurchase)
      throw new HttpError(
        400,
        `Minimum purchase is ${tokenMinPurchase} tokens`,
        "BELOW_MIN_PURCHASE",
        { tokenMinPurchase },
      );
  }
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime()))
    throw new HttpError(400, "Invalid expiry date", "VALIDATION_ERROR");

  if (idempotencyKey) {
    const [already] = await db
      .select()
      .from(tokenTransactionsTable)
      .where(eq(tokenTransactionsTable.idempotencyKey, idempotencyKey));
    if (already) {
      res.json(already);
      return;
    }
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("no key update");
      if (!target) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
      const delta =
        type === "credit" ? amount : type === "debit" ? -amount : amount - target.tokenBalance;
      if (type === "adjustment" && delta === 0)
        throw new HttpError(400, "The balance is already at that value", "NO_CHANGE");
      const moved = await moveTokens(tx, {
        userId,
        delta,
        type,
        adminId: admin.id,
        description,
        notes:
          type === "adjustment"
            ? [`${target.tokenBalance} → ${amount}`, notes].filter(Boolean).join(" · ")
            : notes,
        expiresAt,
        idempotencyKey,
        cashAmount,
        packageId,
      });
      await tx.insert(activityTable).values({
        type: delta >= 0 ? "token_credited" : "token_debited",
        message: `${Math.abs(delta)} token(s) ${delta >= 0 ? "added to" : "removed from"} ${target.email}: ${description} (by ${admin.email})`,
        userId: target.id,
        userName: fullName(target),
      });
      return { ...moved, target, delta };
    });
  } catch (err) {
    // Same key sent twice at the same instant: the second insert lost the race
    if (pgCode(err) === "23505" && idempotencyKey) {
      const [already] = await db
        .select()
        .from(tokenTransactionsTable)
        .where(eq(tokenTransactionsTable.idempotencyKey, idempotencyKey));
      if (already) {
        res.json(already);
        return;
      }
    }
    throw err;
  }

  if (result.delta > 0) {
    notifyLater(
      result.target.id,
      {
        kind: "tokens_added",
        amount: result.delta,
        balance: result.balanceAfter,
        reason: description,
        expiresOn: expiresAt ? formatClubDate(expiresAt, result.target.language) : null,
      },
      `tx:${result.row.id}`,
    );
  }
  const full = await db.query.tokenTransactionsTable.findFirst({
    where: eq(tokenTransactionsTable.id, result.row.id),
    with: { user: true },
  });
  res.json(full);
});

router.get("/tokens/admin/transactions", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = paging(q, 20, 100);
  const conditions: SQL[] = [];
  if (toId(q.userId)) conditions.push(eq(tokenTransactionsTable.userId, toId(q.userId)!));
  const type = oneOf(q.type, ["credit", "debit", "adjustment"] as const);
  if (type) conditions.push(eq(tokenTransactionsTable.type, type));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(tokenTransactionsTable).where(where);
  const data = await db.query.tokenTransactionsTable.findMany({
    where,
    with: { user: true, admin: true },
    orderBy: [desc(tokenTransactionsTable.createdAt), desc(tokenTransactionsTable.id)],
    limit,
    offset,
  });
  // Tokens held by all members right now (the club's outstanding liability)
  const [{ circulating }] = await db
    .select({ circulating: sql<number>`coalesce(sum(${usersTable.tokenBalance}), 0)::int` })
    .from(usersTable);
  res.json({ data, total: Number(total), page, limit, circulating: Number(circulating) });
});

export default router;
