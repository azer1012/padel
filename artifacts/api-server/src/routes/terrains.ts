import { Router } from "express";
import { db, terrainsTable, reservationsTable } from "@workspace/db";
import { eq, and, gte, lt } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/terrains", async (_req, res) => {
  const terrains = await db.select().from(terrainsTable);
  res.json(terrains);
});

router.post("/terrains", requireAdmin, async (req, res) => {
  const { name, description, type, pricePerPerson = 25, capacity = 4, openingTime = "08:00", closingTime = "23:00", photos = [] } = req.body;
  const [terrain] = await db.insert(terrainsTable).values({
    name, description, type, pricePerPerson, capacity, openingTime, closingTime, photos
  }).returning();
  res.status(201).json(terrain);
});

router.get("/terrain-slots", async (req, res) => {
  const { terrainId, date } = req.query as Record<string, string>;
  if (!terrainId || !date) {
    res.status(400).json({ error: "terrainId and date are required" });
    return;
  }
  const id = parseInt(terrainId);
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, id));
  if (!terrain) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }

  const dateObj = new Date(date);
  const dayStart = new Date(dateObj);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateObj);
  dayEnd.setHours(23, 59, 59, 999);

  const existingBookings = await db.select()
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.terrainId, id),
        gte(reservationsTable.startTime, dayStart),
        lt(reservationsTable.startTime, dayEnd),
        eq(reservationsTable.status, "confirmed" as any)
      )
    );

  const bookedTimes = new Set(existingBookings.map(b => b.startTime.getTime()));

  const [openH, openM] = terrain.openingTime.split(":").map(Number);
  const [closeH, closeM] = terrain.closingTime.split(":").map(Number);
  const slots = [];
  let cur = new Date(dateObj);
  cur.setHours(openH, openM || 0, 0, 0);
  const end = new Date(dateObj);
  end.setHours(closeH, closeM || 0, 0, 0);

  while (cur < end) {
    const slotEnd = new Date(cur.getTime() + 90 * 60 * 1000);
    if (slotEnd > end) break;
    slots.push({
      startTime: cur.toISOString(),
      endTime: slotEnd.toISOString(),
      available: !bookedTimes.has(cur.getTime()),
      reservationId: existingBookings.find(b => b.startTime.getTime() === cur.getTime())?.id ?? null,
    });
    cur = new Date(cur.getTime() + 90 * 60 * 1000);
  }

  res.json(slots);
});

router.get("/terrains/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, id));
  if (!terrain) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }
  res.json(terrain);
});

router.patch("/terrains/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, description, type, isActive, pricePerPerson, openingTime, closingTime, photos } = req.body;
  const [updated] = await db.update(terrainsTable)
    .set({ name, description, type, isActive, pricePerPerson, openingTime, closingTime, photos })
    .where(eq(terrainsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }
  res.json(updated);
});

router.delete("/terrains/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.delete(terrainsTable).where(eq(terrainsTable.id, id));
  res.status(204).send();
});

export default router;
