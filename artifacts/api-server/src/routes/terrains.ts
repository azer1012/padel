import { Router } from "express";
import { db, terrainsTable, reservationsTable } from "@workspace/db";
import { and, asc, count, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { loadUser, requireAdmin } from "../lib/auth";
import { HttpError, cleanText, oneOf, requireId } from "../lib/http";
import { isValidCloseHhmm, isValidHhmm } from "../lib/slots";

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
  if (b?.number !== undefined) {
    if (b.number === null || b.number === "") out.number = null;
    else {
      const n = Number(b.number);
      if (!Number.isInteger(n) || n < 1 || n > 999)
        throw new HttpError(400, "Court number must be between 1 and 999", "VALIDATION_ERROR");
      out.number = n;
    }
  }
  if (typeof b?.isMaintenance === "boolean") out.isMaintenance = b.isMaintenance;
  if (b?.maintenanceNote !== undefined) out.maintenanceNote = cleanText(b.maintenanceNote, 200);
  // Overrides: null / "" = use the club settings
  if (b?.pricePerPerson !== undefined) {
    if (b.pricePerPerson === null || b.pricePerPerson === "") out.pricePerPerson = null;
    else {
      const p = Number(b.pricePerPerson);
      if (!Number.isFinite(p) || p < 0 || p > 10_000)
        throw new HttpError(400, "Invalid price", "VALIDATION_ERROR");
      out.pricePerPerson = p;
    }
  }
  if (b?.openingTime !== undefined || b?.closingTime !== undefined) {
    const open = b?.openingTime || null,
      close = b?.closingTime || null;
    if ((open === null) !== (close === null))
      throw new HttpError(
        400,
        "Set both opening and closing time, or neither to use the club hours",
        "VALIDATION_ERROR",
      );
    if (open !== null) {
      if (!isValidHhmm(open) || !isValidCloseHhmm(close))
        throw new HttpError(400, "Invalid time (HH:MM)", "VALIDATION_ERROR");
      if (open >= close)
        throw new HttpError(400, "Closing time must be after opening time", "VALIDATION_ERROR");
    }
    out.openingTime = open;
    out.closingTime = close;
  }
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

/** Players see bookable courts; admins see every non-archived court (archived ones on request). */
router.get("/terrains", loadUser, async (req, res) => {
  const isAdmin = (req as any).dbUser?.role === "admin";
  const archived = isAdmin && req.query.archived === "true";
  const where = isAdmin
    ? archived
      ? isNotNull(terrainsTable.archivedAt)
      : isNull(terrainsTable.archivedAt)
    : and(eq(terrainsTable.isActive, true), isNull(terrainsTable.archivedAt));
  res.json(
    await db
      .select()
      .from(terrainsTable)
      .where(where)
      .orderBy(asc(terrainsTable.sortOrder), asc(terrainsTable.id)),
  );
});

router.post("/terrains", requireAdmin, async (req, res) => {
  const [{ n }] = await db.select({ n: count() }).from(terrainsTable);
  const [terrain] = await db
    .insert(terrainsTable)
    .values({
      sortOrder: Number(n) + 1,
      ...terrainInput(req.body, true),
    } as typeof terrainsTable.$inferInsert)
    .returning();
  res.status(201).json(terrain);
});

/** Display order: the full list of court ids, first to last. */
router.put("/terrains/order", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((v: unknown) => requireId(v, "court"))
    : null;
  if (!ids?.length || new Set(ids).size !== ids.length || ids.length > 200)
    throw new HttpError(400, "ids must list each court once", "VALIDATION_ERROR");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries())
      await tx
        .update(terrainsTable)
        .set({ sortOrder: i + 1 })
        .where(eq(terrainsTable.id, id));
  });
  res.json(
    await db
      .select()
      .from(terrainsTable)
      .where(inArray(terrainsTable.id, ids))
      .orderBy(asc(terrainsTable.sortOrder)),
  );
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
  const [updated] = await db
    .update(terrainsTable)
    .set(patch)
    .where(eq(terrainsTable.id, id))
    .returning();
  if (!updated) throw new HttpError(404, "Court not found", "NOT_FOUND");
  res.json({ ...updated, upcomingBookings: await upcomingBookings(id) });
});

const upcomingBookings = async (terrainId: number) =>
  Number(
    (
      await db
        .select({ n: count() })
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.terrainId, terrainId),
            eq(reservationsTable.status, "confirmed"),
            gt(reservationsTable.startTime, new Date()),
          ),
        )
    )[0].n,
  );

/** Archive: hidden everywhere, history kept. Refused while future bookings exist. */
router.post("/terrains/:id/archive", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const pending = await upcomingBookings(id);
  if (pending > 0)
    throw new HttpError(
      409,
      `This court still has ${pending} upcoming booking(s). Cancel or move them first.`,
      "COURT_HAS_BOOKINGS",
      { upcomingBookings: pending },
    );
  const [updated] = await db
    .update(terrainsTable)
    .set({ archivedAt: new Date(), isActive: false })
    .where(eq(terrainsTable.id, id))
    .returning();
  if (!updated) throw new HttpError(404, "Court not found", "NOT_FOUND");
  res.json(updated);
});

router.post("/terrains/:id/unarchive", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [updated] = await db
    .update(terrainsTable)
    .set({ archivedAt: null })
    .where(eq(terrainsTable.id, id))
    .returning();
  if (!updated) throw new HttpError(404, "Court not found", "NOT_FOUND");
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
      "This court has bookings in its history. Archive it instead of deleting it.",
      "COURT_HAS_HISTORY",
    );
  await db.delete(terrainsTable).where(eq(terrainsTable.id, id));
  res.status(204).send();
});

export default router;
