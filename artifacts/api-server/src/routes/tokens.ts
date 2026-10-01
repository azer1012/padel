import { Router } from "express";
import { db, tokenTransactionsTable, usersTable, activityTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { requireUser, requireAdmin } from "../lib/auth";
import { notifyLater } from "../lib/notify";
import { formatClubDate, type Lang } from "../lib/club-time";

const router = Router();

router.get("/tokens/balance", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  res.json({
    userId: user.id,
    balance: user.tokenBalance,
    pendingExpiry: null,
    nextExpiryDate: null,
  });
});

router.get("/tokens/transactions", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const [{ total }] = await db
    .select({ total: count() })
    .from(tokenTransactionsTable)
    .where(eq(tokenTransactionsTable.userId, user.id));

  const data = await db.query.tokenTransactionsTable.findMany({
    where: eq(tokenTransactionsTable.userId, user.id),
    with: { user: true },
    orderBy: [desc(tokenTransactionsTable.createdAt)],
    limit: limitNum,
    offset,
  });

  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

/**
 * credit: balance + amount · debit: balance − amount (refused if it would go negative)
 * adjustment: sets the balance to `amount` exactly (the transaction stores the real delta).
 */
router.post("/tokens/admin/adjust", requireAdmin, async (req, res) => {
  const admin = (req as any).dbUser;
  const { userId, type, description, notes, expiresAt } = req.body;
  const amount = Number(req.body.amount);

  if (!["credit", "debit", "adjustment"].includes(type)) {
    res.status(400).json({ error: "Invalid type" });
    return;
  }
  if (
    !Number.isInteger(amount) ||
    amount < 0 ||
    (type !== "adjustment" && amount === 0) ||
    amount > 10000
  ) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  if (!description || typeof description !== "string") {
    res.status(400).json({ error: "Description is required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, parseInt(userId)))
        .for("update");
      if (!target) throw new Error("NOT_FOUND");

      const before = target.tokenBalance;
      const after =
        type === "credit" ? before + amount : type === "debit" ? before - amount : amount;
      if (after < 0) throw new Error("NEGATIVE");
      const delta = after - before;

      await tx.update(usersTable).set({ tokenBalance: after }).where(eq(usersTable.id, target.id));
      const [row] = await tx
        .insert(tokenTransactionsTable)
        .values({
          userId: target.id,
          adminId: admin.id,
          type: type as any,
          amount: type === "adjustment" ? Math.abs(delta) : amount,
          balanceAfter: after,
          description,
          notes:
            type === "adjustment"
              ? [`${before} → ${after}`, notes].filter(Boolean).join(" · ")
              : notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        })
        .returning();

      await tx.insert(activityTable).values({
        type: delta >= 0 ? "token_credited" : "token_debited",
        message: `${Math.abs(delta)} token(s) ${delta >= 0 ? "added to" : "removed from"} ${target.email}: ${description}`,
        userId: target.id,
        userName: `${target.firstName ?? ""} ${target.lastName ?? ""}`.trim() || target.email,
      });
      return { row, target, delta, after };
    });

    if (result.delta > 0) {
      const lang = (result.target.language ?? "fr") as Lang;
      notifyLater(
        result.target.id,
        {
          kind: "tokens_added",
          amount: result.delta,
          balance: result.after,
          reason: description,
          expiresOn: expiresAt ? formatClubDate(new Date(expiresAt), lang) : null,
        },
        `tx:${result.row.id}`,
      );
    }

    const full = await db.query.tokenTransactionsTable.findFirst({
      where: eq(tokenTransactionsTable.id, result.row.id),
      with: { user: true },
    });
    res.json(full);
  } catch (err: any) {
    if (err.message === "NOT_FOUND") res.status(404).json({ error: "User not found" });
    else if (err.message === "NEGATIVE")
      res.status(400).json({ error: "Balance cannot go below zero" });
    else throw err;
  }
});

router.get("/tokens/admin/transactions", requireAdmin, async (req, res) => {
  const { userId, type, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (userId) conditions.push(eq(tokenTransactionsTable.userId, parseInt(userId)));
  if (type) conditions.push(eq(tokenTransactionsTable.type, type as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(tokenTransactionsTable)
    .where(whereClause);

  const data = await db.query.tokenTransactionsTable.findMany({
    where: whereClause,
    with: { user: true },
    orderBy: [desc(tokenTransactionsTable.createdAt)],
    limit: limitNum,
    offset,
  });

  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

export default router;
