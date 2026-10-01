import { Router } from "express";
import { db, terrainsTable, reservationsTable } from "@workspace/db";
import { asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { HttpError, cleanText, oneOf, requireId } from "../lib/http";
import { isValidHhmm } from "../lib/slots";

const router = Router();

function terrainInput(b: any, creating: boolean) {
  const out: Partial<typeof terrainsTable.$inferInsert> = {};
  if (creating || b?.name !== undefined) {
    const name = cleanText(b?.name, 60);
    if (!name) throw new HttpError(400, "Court name is required", "VALIDATION_ERROR");
    out.name = name;
  }
  if (creating || b?.type !== undefined) {
    const type = oneOf(b?.type, ["indoor", "outdoor"] as const);
    if (!type) throw new HttpError(400, "Type must be indoor or outdoor", "VALIDATION_ERROR");
    out.type = type;
  }
  if (b?.description !== undefined) out.description = cleanText(b.description, 1000);
  if (typeof b?.isActive === "boolean") out.isActive = b.isActive;
  if (b?.pricePerPerson !== undefined) {
    const p = Number(b.pricePerPerson);
    if (!Number.isFinite(p) || p < 0 || p > 10_000)
      throw new HttpError(400, "Invalid price", "VALIDATION_ERROR");
    out.pricePerPerson = p;
  }
  for (const k of ["openingTime", "closingTime"] as const) {
    if (b?.[k] !== undefined) {
      if (!isValidHhmm(b[k])) throw new HttpError(400, `Invalid ${k} (HH:MM)`, "VALIDATION_ERROR");
      out[k] = b[k];
    }
  }
  if (out.openingTime && out.closingTime && out.openingTime >= out.closingTime)
    throw new HttpError(400, "Closing time must be after opening time", "VALIDATION_ERROR");
  if (b?.photos !== undefined) {
    if (!Array.isArray(b.photos))
      throw new HttpError(400, "photos must be a list", "VALIDATION_ERROR");
    out.photos = b.photos
      .map((p: unknown) => cleanText(p, 500))
      .filter((p: string | null): p is string => !!p && /^(https:\/\/|\/)/.test(p))
      .slice(0, 10);
  }
  return out;
}

router.get("/terrains", async (_req, res) => {
  res.json(await db.select().from(terrainsTable).orderBy(asc(terrainsTable.id)));
});

router.post("/terrains", requireAdmin, async (req, res) => {
  const [terrain] = await db
    .insert(terrainsTable)
    .values({ capacity: 4, ...terrainInput(req.body, true) } as typeof terrainsTable.$inferInsert)
    .returning();
  res.status(201).json(terrain);
});

router.get("/terrains/:id", async (req, res) => {
  const [terrain] = await db
    .select()
    .from(terrainsTable)
    .where(eq(terrainsTable.id, requireId(req.params.id)));
  if (!terrain) throw new HttpError(404, "Court not found", "NOT_FOUND");
  res.json(terrain);
});

router.patch("/terrains/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const patch = terrainInput(req.body, false);
  const [current] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, id));
  if (!current) throw new HttpError(404, "Court not found", "NOT_FOUND");
  if ((patch.openingTime ?? current.openingTime) >= (patch.closingTime ?? current.closingTime))
    throw new HttpError(400, "Closing time must be after opening time", "VALIDATION_ERROR");
  const [updated] = await db
    .update(terrainsTable)
    .set(patch)
    .where(eq(terrainsTable.id, id))
    .returning();
  res.json(updated);
});

/** A court with booking history can't be deleted (it would erase that history): deactivate it. */
router.delete("/terrains/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [{ n }] = await db
    .select({ n: count() })
    .from(reservationsTable)
    .where(eq(reservationsTable.terrainId, id));
  if (Number(n) > 0)
    throw new HttpError(
      409,
      "This court has bookings in its history. Deactivate it instead of deleting it.",
      "COURT_HAS_HISTORY",
    );
  await db.delete(terrainsTable).where(eq(terrainsTable.id, id));
  res.status(204).send();
});

export default router;
