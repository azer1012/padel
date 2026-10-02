import { Router } from "express";
import {
  db,
  equipmentItemsTable,
  reservationEquipmentTable,
  reservationsTable,
} from "@workspace/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { rentedDuring } from "../lib/equipment";
import { getSettings } from "../lib/settings";
import { addDays, clubInstant, clubParts, isClubDate } from "../lib/club-time";
import { fullName } from "../lib/members";
import { HttpError, cleanText, oneOf, requireId, toMoney, type Body } from "../lib/http";

const router = Router();

/** Public catalogue. With ?startTime, each item includes how many are still free for that slot. */
router.get("/equipment", async (req, res) => {
  const items = await db
    .select()
    .from(equipmentItemsTable)
    .where(eq(equipmentItemsTable.isActive, true))
    .orderBy(asc(equipmentItemsTable.category), asc(equipmentItemsTable.name));
  const start = req.query.startTime ? new Date(String(req.query.startTime)) : null;
  if (!start || Number.isNaN(start.getTime())) {
    res.json(items.map((i) => ({ ...i, available: i.stock })));
    return;
  }
  // Same match length as the bookings (club setting), so availability matches what is bookable
  const { bookingDurationMinutes } = await getSettings();
  const out = await rentedDuring(
    db,
    start,
    new Date(start.getTime() + bookingDurationMinutes * 60_000),
  );
  res.json(items.map((i) => ({ ...i, available: Math.max(0, i.stock - (out.get(i.id) ?? 0)) })));
});

function parseItem(body: Body, partial = false) {
  const out: Partial<typeof equipmentItemsTable.$inferInsert> = {};
  if (!partial || body?.name !== undefined) {
    const name = cleanText(body?.name, 80);
    if (!name) throw new HttpError(400, "Name is required", "VALIDATION_ERROR");
    out.name = name;
  }
  if (body?.description !== undefined) out.description = cleanText(body.description, 500);
  if (body?.category !== undefined) out.category = cleanText(body.category, 40) ?? "other";
  if (body?.price !== undefined) {
    const price = toMoney(body.price, 100_000);
    if (price === null) throw new HttpError(400, "Invalid price", "VALIDATION_ERROR");
    out.price = price;
  }
  if (body?.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 10_000)
      throw new HttpError(400, "Stock must be a whole number", "VALIDATION_ERROR");
    out.stock = stock;
  }
  if (typeof body?.isActive === "boolean") out.isActive = body.isActive;
  return out;
}

router.get("/admin/equipment", requireAdmin, async (_req, res) => {
  res.json(
    await db
      .select()
      .from(equipmentItemsTable)
      .orderBy(asc(equipmentItemsTable.category), asc(equipmentItemsTable.name)),
  );
});

router.post("/admin/equipment", requireAdmin, async (req, res) => {
  const [row] = await db
    .insert(equipmentItemsTable)
    .values(parseItem(req.body) as typeof equipmentItemsTable.$inferInsert)
    .returning();
  res.status(201).json(row);
});

router.patch("/admin/equipment/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const patch = parseItem(req.body, true);
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update", "VALIDATION_ERROR");
  const [row] = await db
    .update(equipmentItemsTable)
    .set(patch)
    .where(eq(equipmentItemsTable.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Not found", "NOT_FOUND");
  res.json(row);
});

/** Items with rental history are archived instead of deleted, so past bookings stay readable. */
router.delete("/admin/equipment/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [used] = await db
    .select({ id: reservationEquipmentTable.id })
    .from(reservationEquipmentTable)
    .where(eq(reservationEquipmentTable.itemId, id))
    .limit(1);
  if (used) {
    await db
      .update(equipmentItemsTable)
      .set({ isActive: false })
      .where(eq(equipmentItemsTable.id, id));
    res.json({ archived: true });
    return;
  }
  await db.delete(equipmentItemsTable).where(eq(equipmentItemsTable.id, id));
  res.status(204).end();
});

/** Front-desk prep list: every rental for a club day (YYYY-MM-DD), in start-time order. */
router.get("/admin/equipment/rentals", requireAdmin, async (req, res) => {
  // A club day, whatever timezone the server runs in
  const day = isClubDate(req.query.date) ? req.query.date : clubParts(new Date()).date;
  const from = clubInstant(day, 0);
  const to = clubInstant(addDays(day, 1), 0);
  const reservations = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .where(
      and(
        gte(reservationsTable.startTime, from),
        lt(reservationsTable.startTime, to),
        eq(reservationsTable.status, "confirmed"),
      ),
    );
  if (!reservations.length) {
    res.json([]);
    return;
  }
  const rows = await db.query.reservationEquipmentTable.findMany({
    where: and(
      inArray(
        reservationEquipmentTable.reservationId,
        reservations.map((r) => r.id),
      ),
      inArray(reservationEquipmentTable.status, ["reserved", "handed_out", "returned"]),
    ),
    with: { item: true, user: true, reservation: { with: { terrain: true } } },
  });
  rows.sort((a, b) => +a.reservation.startTime - +b.reservation.startTime || a.id - b.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      status: r.status,
      item: { id: r.item.id, name: r.item.name, category: r.item.category },
      player: r.user ? fullName(r.user) : null,
      reservation: {
        id: r.reservation.id,
        startTime: r.reservation.startTime,
        endTime: r.reservation.endTime,
        terrainName: r.reservation.terrain?.name ?? "",
        guestName: r.reservation.guestName,
      },
    })),
  );
});

router.patch("/admin/equipment/rentals/:id", requireAdmin, async (req, res) => {
  const status = oneOf(req.body?.status, [
    "reserved",
    "handed_out",
    "returned",
    "cancelled",
  ] as const);
  if (!status) throw new HttpError(400, "Invalid status", "VALIDATION_ERROR");
  const [row] = await db
    .update(reservationEquipmentTable)
    .set({ status })
    .where(eq(reservationEquipmentTable.id, requireId(req.params.id)))
    .returning();
  if (!row) throw new HttpError(404, "Not found", "NOT_FOUND");
  res.json(row);
});

export default router;
