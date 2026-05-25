import { Router } from "express";
import { db, newsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/news", async (req, res) => {
  const { page = "1", limit = "10" } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const [{ total }] = await db.select({ total: count() }).from(newsTable)
    .where(eq(newsTable.isPublished, true));

  const data = await db.select().from(newsTable)
    .where(eq(newsTable.isPublished, true))
    .orderBy(desc(newsTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

router.post("/news", requireAdmin, async (req, res) => {
  const { title, excerpt, content, imageUrl, isPublished = false, category } = req.body;
  const [article] = await db.insert(newsTable).values({
    title, excerpt, content, imageUrl, isPublished, category,
    publishedAt: isPublished ? new Date() : undefined,
  }).returning();
  res.status(201).json(article);
});

router.get("/news/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [article] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!article) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(article);
});

router.patch("/news/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { title, excerpt, content, imageUrl, isPublished, category } = req.body;
  const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const wasPublished = existing.isPublished;
  const [updated] = await db.update(newsTable).set({
    title, excerpt, content, imageUrl, isPublished, category,
    publishedAt: isPublished && !wasPublished ? new Date() : existing.publishedAt,
  }).where(eq(newsTable.id, id)).returning();
  res.json(updated);
});

router.delete("/news/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.delete(newsTable).where(eq(newsTable.id, id));
  res.status(204).send();
});

export default router;
