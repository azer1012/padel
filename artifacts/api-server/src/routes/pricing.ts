import { Router } from "express";
import { db, pricingRulesTable, terrainsTable, type PricingRule } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { quote } from "../lib/pricing";
import { isValidCloseHhmm, isValidHhmm } from "../lib/slots";
import { logActivity } from "../lib/activity";
import { HttpError, cleanText, requireId, toId, toMoney, type Body } from "../lib/http";

const router = Router();

/**
 * Validated rule fields. `current` (on update) lets a change of one bound be checked
 * against the other one already stored.
 */
async function parseRule(body: Body, current?: PricingRule) {
  const partial = !!current;
  const out: Partial<typeof pricingRulesTable.$inferInsert> = {};
  const err = (m: string): never => {
    throw new HttpError(400, m, "VALIDATION_ERROR");
  };
  if (!partial || body?.name !== undefined) {
    out.name = cleanText(body?.name, 80) ?? err("Name is required");
  }
  if (!partial || body?.startTime !== undefined) {
    const startTime = body?.startTime;
    if (!isValidHhmm(startTime)) return err("Invalid start time");
    out.startTime = startTime;
  }
  if (!partial || body?.endTime !== undefined) {
    const endTime = body?.endTime;
    if (!isValidCloseHhmm(endTime)) return err("Invalid end time");
    out.endTime = endTime;
  }
  const start = out.startTime ?? current?.startTime,
    end = out.endTime ?? current?.endTime;
  if (start && end && start >= end) err("End time must be after start time");
  if (body?.daysOfWeek !== undefined) {
    const picked: unknown[] = Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [];
    const days = [...new Set(picked.map(Number))]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort();
    if (!days.length) err("Pick at least one day");
    out.daysOfWeek = days;
  }
  if (body?.tokensPerSpot !== undefined) {
    const n = Number(body.tokensPerSpot);
    if (!Number.isInteger(n) || n < 1 || n > 10) err("Tokens per spot must be 1 to 10");
    out.tokensPerSpot = n;
  }
  if (body?.pricePerPerson !== undefined) {
    if (body.pricePerPerson === null || body.pricePerPerson === "") out.pricePerPerson = null;
    else {
      out.pricePerPerson = toMoney(body.pricePerPerson, 10_000) ?? err("Invalid price");
    }
  }
  if (body?.terrainId !== undefined) {
    if (body.terrainId === null || body.terrainId === "") out.terrainId = null;
    else {
      const terrainId = requireId(body.terrainId, "court");
      const [court] = await db
        .select({ id: terrainsTable.id })
        .from(terrainsTable)
        .where(eq(terrainsTable.id, terrainId));
      if (!court) throw new HttpError(404, "Court not found", "NOT_FOUND");
      out.terrainId = terrainId;
    }
  }
  if (typeof body?.isPeak === "boolean") out.isPeak = body.isPeak;
  if (typeof body?.isActive === "boolean") out.isActive = body.isActive;
  if (body?.priority !== undefined) {
    const n = Number(body.priority);
    if (!Number.isInteger(n) || n < -1000 || n > 1000) err("Invalid priority");
    out.priority = n;
  }
  return out;
}

/** Public: lets the booking UI explain pricing ("peak hours 17:00–23:00"). */
router.get("/pricing/rules", async (_req, res) => {
  res.json(
    await db
      .select()
      .from(pricingRulesTable)
      .where(eq(pricingRulesTable.isActive, true))
      .orderBy(asc(pricingRulesTable.startTime)),
  );
});

/** Public: the price of one slot, e.g. before confirming a booking. */
router.get("/pricing/quote", async (req, res) => {
  const terrainId = toId(req.query.terrainId),
    start = new Date(String(req.query.startTime));
  const [terrain] = terrainId
    ? await db.select().from(terrainsTable).where(eq(terrainsTable.id, terrainId))
    : [];
  if (!terrain || Number.isNaN(start.getTime()))
    throw new HttpError(400, "terrainId and startTime are required", "VALIDATION_ERROR");
  const p = await quote(terrain, start);
  res.json({ ...p, fullCourtTokens: p.tokensFullCourt });
});

router.get("/admin/pricing/rules", requireAdmin, async (_req, res) => {
  res.json(
    await db
      .select()
      .from(pricingRulesTable)
      .orderBy(asc(pricingRulesTable.startTime), asc(pricingRulesTable.id)),
  );
});

router.post("/admin/pricing/rules", requireAdmin, async (req, res) => {
  const [row] = await db
    .insert(pricingRulesTable)
    .values((await parseRule(req.body)) as typeof pricingRulesTable.$inferInsert)
    .returning();
  await logActivity(req, "pricing_updated", `Pricing rule "${row.name}" created`);
  res.status(201).json(row);
});

router.patch("/admin/pricing/rules/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [current] = await db.select().from(pricingRulesTable).where(eq(pricingRulesTable.id, id));
  if (!current) throw new HttpError(404, "Not found", "NOT_FOUND");
  const patch = await parseRule(req.body, current);
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update", "VALIDATION_ERROR");
  const [row] = await db
    .update(pricingRulesTable)
    .set(patch)
    .where(eq(pricingRulesTable.id, id))
    .returning();
  await logActivity(req, "pricing_updated", `Pricing rule "${row.name}" updated`);
  res.json(row);
});

router.delete("/admin/pricing/rules/:id", requireAdmin, async (req, res) => {
  const [row] = await db
    .delete(pricingRulesTable)
    .where(eq(pricingRulesTable.id, requireId(req.params.id)))
    .returning();
  if (row) await logActivity(req, "pricing_updated", `Pricing rule "${row.name}" deleted`);
  res.status(204).end();
});

export default router;
