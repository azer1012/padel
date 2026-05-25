import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireUser } from "../lib/auth";

const router = Router();

router.get("/notifications", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const { unreadOnly } = req.query;

  const conditions: any[] = [eq(notificationsTable.userId, user.id)];
  if (unreadOnly === "true") {
    conditions.push(eq(notificationsTable.isRead, false));
  }

  const notifications = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(notificationsTable.createdAt);

  res.json(notifications.reverse());
});

router.post("/notifications/:id/read", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const user = (req as any).dbUser;
  const [updated] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.post("/notifications/read-all", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const result = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)))
    .returning();
  res.json({ updated: result.length });
});

export default router;
