import {
  db,
  equipmentItemsTable,
  reservationEquipmentTable,
  reservationsTable,
  type Queryable,
  type Tx,
} from "@workspace/db";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";

export type EquipmentRequest = { itemId: number; quantity: number }[];

/** Units of each item already out during [start, end) (reserved or handed out, on confirmed bookings). */
export async function rentedDuring(q: Queryable, start: Date, end: Date, itemIds?: number[]) {
  const rows = await q
    .select({
      itemId: reservationEquipmentTable.itemId,
      qty: sql<number>`coalesce(sum(${reservationEquipmentTable.quantity}), 0)::int`,
    })
    .from(reservationEquipmentTable)
    .innerJoin(reservationsTable, eq(reservationsTable.id, reservationEquipmentTable.reservationId))
    .where(
      and(
        eq(reservationsTable.status, "confirmed"),
        inArray(reservationEquipmentTable.status, ["reserved", "handed_out"]),
        lt(reservationsTable.startTime, end),
        gt(reservationsTable.endTime, start),
        ...(itemIds?.length ? [inArray(reservationEquipmentTable.itemId, itemIds)] : []),
      ),
    )
    .groupBy(reservationEquipmentTable.itemId);
  return new Map(rows.map((r) => [r.itemId, Number(r.qty)]));
}

export function normalizeRequest(raw: unknown): EquipmentRequest {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<number, number>();
  for (const r of raw as { itemId?: unknown; quantity?: unknown }[]) {
    const itemId = Number(r?.itemId),
      quantity = Math.floor(Number(r?.quantity));
    if (Number.isInteger(itemId) && itemId > 0 && quantity > 0)
      merged.set(itemId, Math.min(8, (merged.get(itemId) ?? 0) + quantity));
  }
  return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export class EquipmentError extends Error {
  constructor(
    public itemName: string,
    public available: number,
  ) {
    super("EQUIPMENT_UNAVAILABLE");
  }
}

/**
 * Reserves equipment for a booking inside the caller's transaction.
 * Item rows are locked so two concurrent bookings can't both take the last unit.
 */
export async function reserveEquipment(
  tx: Tx,
  args: {
    reservationId: number;
    userId: number | null;
    start: Date;
    end: Date;
    items: EquipmentRequest;
  },
) {
  if (!args.items.length) return [];
  const ids = args.items.map((i) => i.itemId);
  const items = await tx
    .select()
    .from(equipmentItemsTable)
    .where(inArray(equipmentItemsTable.id, ids))
    .orderBy(equipmentItemsTable.id)
    .for("update");
  const out = await rentedDuring(tx, args.start, args.end, ids);
  const lines: { name: string; quantity: number; price: number }[] = [];
  for (const req of args.items) {
    const item = items.find((i) => i.id === req.itemId);
    if (!item || !item.isActive) throw new EquipmentError(item?.name ?? `#${req.itemId}`, 0);
    const available = item.stock - (out.get(item.id) ?? 0);
    if (req.quantity > available) throw new EquipmentError(item.name, Math.max(0, available));
    await tx.insert(reservationEquipmentTable).values({
      reservationId: args.reservationId,
      itemId: item.id,
      userId: args.userId,
      quantity: req.quantity,
      unitPrice: item.price,
    });
    lines.push({ name: item.name, quantity: req.quantity, price: item.price });
  }
  return lines;
}

export async function equipmentFor(reservationId: number, userId?: number) {
  return db
    .select({
      name: equipmentItemsTable.name,
      quantity: reservationEquipmentTable.quantity,
      price: reservationEquipmentTable.unitPrice,
    })
    .from(reservationEquipmentTable)
    .innerJoin(equipmentItemsTable, eq(equipmentItemsTable.id, reservationEquipmentTable.itemId))
    .where(
      and(
        eq(reservationEquipmentTable.reservationId, reservationId),
        eq(reservationEquipmentTable.status, "reserved"),
        ...(userId ? [eq(reservationEquipmentTable.userId, userId)] : []),
      ),
    );
}
