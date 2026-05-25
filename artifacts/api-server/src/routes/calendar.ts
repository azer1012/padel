import { Router } from "express";
import { db, terrainsTable, reservationsTable, reservationPlayersTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { loadUser } from "../lib/auth";

const router = Router();

function buildSlotsForTerrainDay(
  terrain: typeof terrainsTable.$inferSelect,
  reservationsForTerrain: any[],
  requestedDate: Date,
  now: Date,
  dbUserId: number | null,
  isAdmin: boolean,
): object[] {
  const [openH, openM] = terrain.openingTime.split(":").map(Number);
  const [closeH, closeM] = terrain.closingTime.split(":").map(Number);

  const opening = new Date(requestedDate);
  opening.setHours(openH, openM, 0, 0);
  const closing = new Date(requestedDate);
  closing.setHours(closeH, closeM, 0, 0);

  const reservationMap = new Map(
    reservationsForTerrain.map(r => [r.startTime.toISOString(), r])
  );

  const slots: object[] = [];
  const cursor = new Date(opening);

  while (cursor.getTime() + 90 * 60 * 1000 <= closing.getTime()) {
    const slotEnd = new Date(cursor.getTime() + 90 * 60 * 1000);
    const reservation = reservationMap.get(cursor.toISOString());
    const isPast = cursor <= now;

    if (reservation) {
      const isFullCourt = reservation.bookingMode === "full_court";
      const isLegacy = reservation.bookingMode === null;
      const isOwnSpot = reservation.bookingMode === "own_spot";

      let filledSpots: number;
      let openSpots: number;

      if (isFullCourt) {
        // Entire court booked — fully occupied regardless of player rows
        filledSpots = reservation.totalSpots ?? 4;
        openSpots = 0;
      } else if (isLegacy) {
        // Legacy (pre-multiplay) reservation: treat as single-player session
        // with remaining spots potentially open, based on actual player rows
        filledSpots = Math.max(1, reservation.players.length);
        openSpots = Math.max(0, (reservation.totalSpots ?? 4) - filledSpots);
      } else {
        // own_spot: each player paid for their spot
        filledSpots = reservation.players.length;
        openSpots = Math.max(0, (reservation.totalSpots ?? 4) - filledSpots);
      }

      // Player data: admin sees full detail; others see name + own userId only
      const players = reservation.players.map((p: any) => {
        const isOwn = p.userId === dbUserId;
        return {
          id: p.id,
          name: p.user
            ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || p.user.email
            : "Player",
          userId: (isAdmin || isOwn) ? p.userId : null,
          paymentType: isAdmin ? p.paymentType : null,
          paymentStatus: isAdmin ? p.paymentStatus : null,
        };
      });

      slots.push({
        startTime: cursor.toISOString(),
        endTime: slotEnd.toISOString(),
        status: openSpots <= 0 ? "full" : "partial",
        reservationId: reservation.id,
        bookingMode: reservation.bookingMode,
        totalSpots: reservation.totalSpots ?? 4,
        filledSpots,
        openSpots,
        isPublic: reservation.isPublic,
        publicDescription: reservation.publicDescription,
        players,
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

  return slots;
}

router.get("/calendar", loadUser, async (req, res) => {
  const { date, endDate, terrainIds } = req.query as Record<string, string>;

  if (!date) {
    res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    return;
  }

  const startDate = new Date(date);
  if (isNaN(startDate.getTime())) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  const dbUser = (req as any).dbUser as { id: number; role: string } | undefined;
  const isAdmin = dbUser?.role === "admin";
  const currentUserId = dbUser?.id ?? null;

  // Determine date range (single day or range up to 7 days)
  let rangeEnd = new Date(startDate);
  if (endDate) {
    const parsedEnd = new Date(endDate);
    if (!isNaN(parsedEnd.getTime()) && parsedEnd > startDate) {
      // Cap at 7 days to prevent abuse
      const maxEnd = new Date(startDate);
      maxEnd.setDate(maxEnd.getDate() + 6);
      rangeEnd = parsedEnd <= maxEnd ? parsedEnd : maxEnd;
    }
  }

  const allTerrains = await db.select().from(terrainsTable)
    .where(eq(terrainsTable.isActive, true));

  let terrains = allTerrains;
  if (terrainIds) {
    const ids = terrainIds.split(",").map(Number).filter(Boolean);
    terrains = allTerrains.filter(t => ids.includes(t.id));
  }

  if (terrains.length === 0) {
    res.json({ date, endDate: endDate || undefined, terrains: [] });
    return;
  }

  const dayStart = new Date(startDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(rangeEnd);
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

  // Build result: for each terrain, collect slots across the entire date range
  const result = terrains.map(terrain => {
    const terrainReservations = reservations.filter(r => r.terrainId === terrain.id);
    const allSlots: object[] = [];

    // Iterate each day in the range
    const cursor = new Date(startDate);
    while (cursor <= rangeEnd) {
      const dayReservations = terrainReservations.filter(r => {
        const d = r.startTime;
        return d.getFullYear() === cursor.getFullYear() &&
          d.getMonth() === cursor.getMonth() &&
          d.getDate() === cursor.getDate();
      });

      const daySlots = buildSlotsForTerrainDay(
        terrain, dayReservations, cursor, now, currentUserId, isAdmin,
      );
      allSlots.push(...daySlots);

      cursor.setDate(cursor.getDate() + 1);
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
      slots: allSlots,
    };
  });

  res.json({ date, endDate: endDate || undefined, terrains: result });
});

export default router;
