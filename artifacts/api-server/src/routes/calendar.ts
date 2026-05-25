import { Router } from "express";
import { db, terrainsTable, reservationsTable, reservationPlayersTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

const router = Router();

router.get("/calendar", async (req, res) => {
  const { date, terrainIds } = req.query as Record<string, string>;

  if (!date) {
    res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    return;
  }

  const requestedDate = new Date(date);
  if (isNaN(requestedDate.getTime())) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  const allTerrains = await db.select().from(terrainsTable)
    .where(eq(terrainsTable.isActive, true));

  let terrains = allTerrains;
  if (terrainIds) {
    const ids = terrainIds.split(",").map(Number).filter(Boolean);
    terrains = allTerrains.filter(t => ids.includes(t.id));
  }

  if (terrains.length === 0) {
    res.json({ date, terrains: [] });
    return;
  }

  const dayStart = new Date(requestedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(requestedDate);
  dayEnd.setHours(23, 59, 59, 999);

  const tids = terrains.map(t => t.id);

  const reservations = await db.query.reservationsTable.findMany({
    where: and(
      inArray(reservationsTable.terrainId, tids),
      gte(reservationsTable.startTime, dayStart),
      lte(reservationsTable.startTime, dayEnd),
      eq(reservationsTable.status, "confirmed" as any),
    ),
    with: {
      players: { with: { user: true } },
      user: true,
    },
  });

  const now = new Date();

  const result = terrains.map(terrain => {
    const [openH, openM] = terrain.openingTime.split(":").map(Number);
    const [closeH, closeM] = terrain.closingTime.split(":").map(Number);

    const opening = new Date(requestedDate);
    opening.setHours(openH, openM, 0, 0);
    const closing = new Date(requestedDate);
    closing.setHours(closeH, closeM, 0, 0);

    const terrainReservations = reservations.filter(r => r.terrainId === terrain.id);
    const reservationMap = new Map(
      terrainReservations.map(r => [r.startTime.toISOString(), r])
    );

    const slots: object[] = [];
    const cursor = new Date(opening);

    while (cursor.getTime() + 90 * 60 * 1000 <= closing.getTime()) {
      const slotEnd = new Date(cursor.getTime() + 90 * 60 * 1000);
      const reservation = reservationMap.get(cursor.toISOString());
      const isPast = cursor <= now;

      if (reservation) {
        const filledSpots = reservation.players.length > 0 ? reservation.players.length : 1;
        const openSpots = Math.max(0, reservation.totalSpots - filledSpots);
        slots.push({
          startTime: cursor.toISOString(),
          endTime: slotEnd.toISOString(),
          status: openSpots <= 0 ? "full" : "partial",
          reservationId: reservation.id,
          bookingMode: reservation.bookingMode,
          totalSpots: reservation.totalSpots,
          filledSpots,
          openSpots,
          isPublic: reservation.isPublic,
          publicDescription: reservation.publicDescription,
          players: reservation.players.map(p => ({
            id: p.id,
            userId: p.userId,
            name: p.user ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || p.user.email : "Player",
            paymentType: p.paymentType,
            paymentStatus: p.paymentStatus,
          })),
          creatorName: reservation.user
            ? `${reservation.user.firstName ?? ""} ${reservation.user.lastName ?? ""}`.trim() || reservation.user.email
            : reservation.guestName ?? "Guest",
        });
      } else {
        slots.push({
          startTime: cursor.toISOString(),
          endTime: slotEnd.toISOString(),
          status: isPast ? "past" : "available",
          reservationId: null,
          bookingMode: null,
          totalSpots: 4,
          filledSpots: 0,
          openSpots: 4,
          isPublic: false,
          publicDescription: null,
          players: [],
          creatorName: null,
        });
      }

      cursor.setTime(slotEnd.getTime());
    }

    return {
      terrain: {
        id: terrain.id,
        name: terrain.name,
        type: terrain.type,
        pricePerPerson: terrain.pricePerPerson,
        openingTime: terrain.openingTime,
        closingTime: terrain.closingTime,
      },
      slots,
    };
  });

  res.json({ date, terrains: result });
});

export default router;
