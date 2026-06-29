import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, ilike, or, count, sql } from "drizzle-orm";
import { requireAuth, requireUser, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/users/me", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  res.json(user);
});

router.patch("/users/me", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const { firstName, lastName, phone, language } = req.body;
  const [updated] = await db.update(usersTable)
    .set({ firstName, lastName, phone, language, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(updated);
});

router.post("/users/sync", requireAuth, async (req, res) => {
  const authUserId = (req as any).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { email, firstName, lastName, imageUrl } = req.body;
  const existing = await db.select().from(usersTable).where(eq(usersTable.supabaseAuthId, authUserId));
  if (existing.length > 0) {
    const [updated] = await db.update(usersTable)
      .set({ email, firstName, lastName, avatarUrl: imageUrl, updatedAt: new Date() })
      .where(eq(usersTable.supabaseAuthId, authUserId))
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db.insert(usersTable).values({
    supabaseAuthId: authUserId,
    email: email || `${authUserId}@placeholder.local`,
    firstName,
    lastName,
    avatarUrl: imageUrl,
    role: "player",
    tokenBalance: 0,
    language: "fr",
}).returning();
  res.status(201).json(created);
});

router.get("/users", requireAdmin, async (req, res) => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = db.select().from(usersTable);
  if (search) {
    query = (query as any).where(
      or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`),
      )
    );
  }

  const searchCondition = search
    ? or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`),
      )
    : undefined;
  const [{ total }] = await db.select({ total: count() }).from(usersTable).where(searchCondition);
  const data = await query.limit(limitNum).offset(offset);

  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

router.get("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
