import { Router } from "express";
import { db, terrainsTable, reservationsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/terrain-slots", async (req, res) => {
  const { terrainId, date } = req.query as Record<string, string>;

  if (!terrainId || !date) {
    res.status(400).json({ error: "terrainId and date are required" });
    return;
  }

  const [terrain] = await db.select().from(terrainsTable)
    .where(eq(terrainsTable.id, parseInt(terrainId)));
  if (!terrain) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }

  const requestedDate = new Date(date);
  const dayStart = new Date(requestedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(requestedDate);
  dayEnd.setHours(23, 59, 59, 999);

  const existingReservations = await db.select({
    startTime: reservationsTable.startTime,
  }).from(reservationsTable).where(
    and(
      eq(reservationsTable.terrainId, terrain.id),
      gte(reservationsTable.startTime, dayStart),
      lte(reservationsTable.startTime, dayEnd),
      eq(reservationsTable.status, "confirmed" as any)
    )
  );

  const bookedSet = new Set(existingReservations.map(r => r.startTime.toISOString()));

  const [openH, openM] = terrain.openingTime.split(":").map(Number);
  const [closeH, closeM] = terrain.closingTime.split(":").map(Number);

  const now = new Date();
  const slots: { startTime: string; endTime: string; isAvailable: boolean; isBooked: boolean }[] = [];

  const current = new Date(requestedDate);
  current.setHours(openH, openM, 0, 0);

  const closing = new Date(requestedDate);
  closing.setHours(closeH, closeM, 0, 0);

  while (current.getTime() + 90 * 60 * 1000 <= closing.getTime()) {
    const slotEnd = new Date(current.getTime() + 90 * 60 * 1000);
    const isBooked = bookedSet.has(current.toISOString());
    const isPast = current <= now;

    slots.push({
      startTime: current.toISOString(),
      endTime: slotEnd.toISOString(),
      isAvailable: !isBooked && !isPast,
      isBooked,
    });

    current.setTime(slotEnd.getTime());
  }

  res.json(slots);
});

export default router;
