import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { currentUser, requireUser } from "../lib/auth";
import { HttpError, requireId } from "../lib/http";

const router = Router();

router.get("/notifications", requireUser, async (req, res) => {
  const user = currentUser(req);
  const conditions = [eq(notificationsTable.userId, user.id)];
  if (req.query.unreadOnly === "true") conditions.push(eq(notificationsTable.isRead, false));

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
    .limit(50);

  res.json(notifications);
});

router.post("/notifications/:id/read", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = currentUser(req);
  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
    .returning();
  if (!updated) throw new HttpError(404, "Notification not found", "NOT_FOUND");
  res.json(updated);
});

router.post("/notifications/read-all", requireUser, async (req, res) => {
  const user = currentUser(req);
  const result = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)))
    .returning();
  res.json({ updated: result.length });
});

export default router;
