import { Router } from "express";
import { db, tokenTransactionsTable, usersTable, activityTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { requireUser, requireAdmin } from "../lib/auth";

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

  const [{ total }] = await db.select({ total: count() }).from(tokenTransactionsTable)
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

router.post("/tokens/admin/adjust", requireAdmin, async (req, res) => {
  const admin = (req as any).dbUser;
  const { userId, amount, type, description, notes, expiresAt } = req.body;

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(userId)));
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let newBalance = targetUser.tokenBalance;
  if (type === "credit") newBalance += amount;
  else if (type === "debit") newBalance -= amount;
  else newBalance += amount;

  if (newBalance < 0) newBalance = 0;

  await db.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, targetUser.id));

  const [tx] = await db.insert(tokenTransactionsTable).values({
    userId: targetUser.id,
    adminId: admin.id,
    type: type as any,
    amount,
    balanceAfter: newBalance,
    description,
    notes,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  }).returning();

  await db.insert(activityTable).values({
    type: type === "credit" ? "token_credited" : "token_debited",
    message: `${amount} token(s) ${type === "credit" ? "added to" : "removed from"} ${targetUser.email}: ${description}`,
    userId: targetUser.id,
    userName: `${targetUser.firstName ?? ""} ${targetUser.lastName ?? ""}`.trim() || targetUser.email,
  });

  const full = await db.query.tokenTransactionsTable.findFirst({
    where: eq(tokenTransactionsTable.id, tx.id),
    with: { user: true },
  });

  res.json(full);
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

  const [{ total }] = await db.select({ total: count() }).from(tokenTransactionsTable)
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
