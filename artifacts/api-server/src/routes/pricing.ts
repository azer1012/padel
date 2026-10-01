import { Router } from "express";
import { db, pricingRulesTable, terrainsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { quote } from "../lib/pricing";

const router = Router();
const HHMM = /^([01]\d|2[0-4]):[0-5]\d$/;

function parseRule(body: any, partial = false) {
  const out: Record<string, unknown> = {};
  const err = (m: string) => {
    throw Object.assign(new Error(m), { status: 400 });
  };
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) err("Name is required");
    out.name = String(body.name).trim();
  }
  if (!partial || body.startTime !== undefined) {
    if (!HHMM.test(body.startTime)) err("Invalid start time");
    out.startTime = body.startTime;
  }
  if (!partial || body.endTime !== undefined) {
    if (!HHMM.test(body.endTime)) err("Invalid end time");
    out.endTime = body.endTime;
  }
  if (out.startTime && out.endTime && String(out.startTime) >= String(out.endTime))
    err("End time must be after start time");
  if (body.daysOfWeek !== undefined) {
    const days = [...new Set((body.daysOfWeek as unknown[]).map(Number))]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort();
    if (!days.length) err("Pick at least one day");
    out.daysOfWeek = days;
  }
  if (body.tokensPerSpot !== undefined) {
    const n = Number(body.tokensPerSpot);
    if (!Number.isInteger(n) || n < 1 || n > 10) err("Tokens per spot must be 1 to 10");
    out.tokensPerSpot = n;
  }
  if (body.pricePerPerson !== undefined)
    out.pricePerPerson =
      body.pricePerPerson === null || body.pricePerPerson === ""
        ? null
        : Number(body.pricePerPerson);
  if (body.terrainId !== undefined) out.terrainId = body.terrainId ? Number(body.terrainId) : null;
  for (const k of ["isPeak", "isActive"]) if (typeof body[k] === "boolean") out[k] = body[k];
  if (body.priority !== undefined) out.priority = Number(body.priority) || 0;
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
  const terrainId = Number(req.query.terrainId),
    start = new Date(String(req.query.startTime));
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, terrainId));
  if (!terrain || Number.isNaN(start.getTime())) {
    res.status(400).json({ error: "terrainId and startTime are required" });
    return;
  }
  const p = await quote(terrain, start);
  res.json({ ...p, fullCourtTokens: p.tokensPerSpot * 4 });
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
  try {
    const [row] = await db
      .insert(pricingRulesTable)
      .values(parseRule(req.body) as any)
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.status) res.status(400).json({ error: e.message });
    else throw e;
  }
});

router.patch("/admin/pricing/rules/:id", requireAdmin, async (req, res) => {
  try {
    const [row] = await db
      .update(pricingRulesTable)
      .set(parseRule(req.body, true) as any)
      .where(eq(pricingRulesTable.id, Number(req.params.id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (e: any) {
    if (e.status) res.status(400).json({ error: e.message });
    else throw e;
  }
});

router.delete("/admin/pricing/rules/:id", requireAdmin, async (req, res) => {
  await db.delete(pricingRulesTable).where(eq(pricingRulesTable.id, Number(req.params.id)));
  res.status(204).end();
});

export default router;
