import { Router } from "express";
import { db, newsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { requireAdmin, loadUser, optionalUser } from "../lib/auth";
import { HttpError, cleanImageUrl, cleanText, paging, requireId, type Body } from "../lib/http";

const router = Router();

/** Validated article fields. Images must be https (or a file of the site itself). */
function articleInput(b: Body, creating: boolean) {
  const out: Partial<typeof newsTable.$inferInsert> = {};
  if (creating || b?.title !== undefined) {
    const title = cleanText(b?.title, 160);
    if (!title) throw new HttpError(400, "Title is required", "VALIDATION_ERROR");
    out.title = title;
  }
  if (creating || b?.content !== undefined) {
    const content = cleanText(b?.content, 20_000);
    if (!content) throw new HttpError(400, "Content is required", "VALIDATION_ERROR");
    out.content = content;
  }
  if (b?.excerpt !== undefined) out.excerpt = cleanText(b.excerpt, 400);
  if (b?.category !== undefined) out.category = cleanText(b.category, 40);
  if (b?.imageUrl !== undefined) out.imageUrl = cleanImageUrl(b.imageUrl);
  if (typeof b?.isPublished === "boolean") out.isPublished = b.isPublished;
  return out;
}

router.get("/news", async (req, res) => {
  const { page, limit, offset } = paging(req.query as Record<string, unknown>, 10, 50);

  const [{ total }] = await db
    .select({ total: count() })
    .from(newsTable)
    .where(eq(newsTable.isPublished, true));

  const data = await db
    .select()
    .from(newsTable)
    .where(eq(newsTable.isPublished, true))
    .orderBy(desc(newsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ data, total: Number(total), page, limit });
});

router.post("/news", requireAdmin, async (req, res) => {
  const values = articleInput(req.body, true) as typeof newsTable.$inferInsert;
  const [article] = await db
    .insert(newsTable)
    .values({ ...values, publishedAt: values.isPublished ? new Date() : undefined })
    .returning();
  res.status(201).json(article);
});

router.get("/news/:id", loadUser, async (req, res) => {
  const id = requireId(req.params.id);
  const [article] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!article || (!article.isPublished && optionalUser(req)?.role !== "admin"))
    throw new HttpError(404, "Not found", "NOT_FOUND");
  res.json(article);
});

router.patch("/news/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const patch = articleInput(req.body, false);
  const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, id));
  if (!existing) throw new HttpError(404, "Not found", "NOT_FOUND");
  const [updated] = await db
    .update(newsTable)
    .set({
      ...patch,
      publishedAt: patch.isPublished && !existing.isPublished ? new Date() : existing.publishedAt,
    })
    .where(eq(newsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/news/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  await db.delete(newsTable).where(eq(newsTable.id, id));
  res.status(204).send();
});

export default router;
