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

const router = Router();
const SLOT_MS = 90 * 60 * 1000;

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
  const out = await rentedDuring(db, start, new Date(start.getTime() + SLOT_MS));
  res.json(items.map((i) => ({ ...i, available: Math.max(0, i.stock - (out.get(i.id) ?? 0)) })));
});

function parseItem(body: any, partial = false) {
  const out: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) throw Object.assign(new Error("Name is required"), { status: 400 });
    out.name = String(body.name).trim();
  }
  if (body.description !== undefined) out.description = body.description || null;
  if (body.category !== undefined) out.category = String(body.category || "other");
  if (body.price !== undefined) out.price = Math.max(0, Number(body.price) || 0);
  if (body.stock !== undefined) out.stock = Math.max(0, Math.floor(Number(body.stock) || 0));
  if (typeof body.isActive === "boolean") out.isActive = body.isActive;
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
  try {
    const [row] = await db
      .insert(equipmentItemsTable)
      .values(parseItem(req.body) as any)
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.status) res.status(400).json({ error: e.message });
    else throw e;
  }
});

router.patch("/admin/equipment/:id", requireAdmin, async (req, res) => {
  try {
    const [row] = await db
      .update(equipmentItemsTable)
      .set(parseItem(req.body, true) as any)
      .where(eq(equipmentItemsTable.id, Number(req.params.id)))
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

/** Items with rental history are archived instead of deleted, so past bookings stay readable. */
router.delete("/admin/equipment/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
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

/** Front-desk prep list: every rental for a day (YYYY-MM-DD), in start-time order. */
router.get("/admin/equipment/rentals", requireAdmin, async (req, res) => {
  const day = String(req.query.date ?? "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00`)
    : new Date(new Date().setHours(0, 0, 0, 0));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const reservations = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .where(
      and(
        gte(reservationsTable.startTime, from),
        lt(reservationsTable.startTime, to),
        eq(reservationsTable.status, "confirmed" as any),
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
      inArray(reservationEquipmentTable.status, ["reserved", "handed_out", "returned"] as any),
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
      player: r.user
        ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email
        : null,
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
  const status = req.body?.status;
  if (!["reserved", "handed_out", "returned", "cancelled"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [row] = await db
    .update(reservationEquipmentTable)
    .set({ status })
    .where(eq(reservationEquipmentTable.id, Number(req.params.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

export default router;
