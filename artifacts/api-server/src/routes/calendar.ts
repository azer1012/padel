import { Router } from "express";
import { db, terrainsTable, reservationsTable, reservationPlayersTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { loadUser } from "../lib/auth";
import { loadActiveRules, priceFor } from "../lib/pricing";
import type { PricingRule } from "@workspace/db";

const router = Router();

/** Admins see full names; everyone else sees "Yasmine B." and never an email address. */
function displayName(
  u: { firstName?: string | null; lastName?: string | null; email?: string } | null | undefined,
  full: boolean,
  fallback: string,
) {
  if (!u) return fallback;
  if (full) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || fallback;
  const first = (u.firstName ?? "").trim(),
    initial = (u.lastName ?? "").trim().charAt(0);
  return first ? `${first}${initial ? ` ${initial}.` : ""}` : fallback;
}

function buildSlotsForTerrainDay(
  terrain: typeof terrainsTable.$inferSelect,
  reservationsForTerrain: any[],
  requestedDate: Date,
  now: Date,
  dbUserId: number | null,
  isAdmin: boolean,
  rules: PricingRule[] = [],
): object[] {
  const [openH, openM] = terrain.openingTime.split(":").map(Number);
  const [closeH, closeM] = terrain.closingTime.split(":").map(Number);

  const opening = new Date(requestedDate);
  opening.setHours(openH, openM, 0, 0);
  const closing = new Date(requestedDate);
  closing.setHours(closeH, closeM, 0, 0);

  const reservationMap = new Map(reservationsForTerrain.map((r) => [r.startTime.toISOString(), r]));

  const slots: object[] = [];
  const cursor = new Date(opening);

  while (cursor.getTime() + 90 * 60 * 1000 <= closing.getTime()) {
    const slotEnd = new Date(cursor.getTime() + 90 * 60 * 1000);
    const reservation = reservationMap.get(cursor.toISOString());
    const isPast = cursor <= now;
    const p = priceFor(rules, terrain, cursor);
    const price = {
      tokensPerSpot: p.tokensPerSpot,
      pricePerPerson: p.pricePerPerson,
      isPeak: p.isPeak,
      priceLabel: p.ruleName,
    };

    if (reservation) {
      // Legacy detection: bookingMode is NOT NULL (default full_court), but
      // old single-player bookings were created before multi-player support.
      // They have tokensCharged < 4 (only 1 token charged) and no player rows.
      // Treat these as own_spot sessions with remaining open spots.
      const isLegacyFullCourt =
        reservation.bookingMode === "full_court" &&
        reservation.tokensCharged < 4 &&
        reservation.players.length === 0;

      const isFullCourt = reservation.bookingMode === "full_court" && !isLegacyFullCourt;
      const isOwnSpot = reservation.bookingMode === "own_spot" || isLegacyFullCourt;

      let filledSpots: number;
      let openSpots: number;

      if (isFullCourt) {
        // Explicit full-court booking: all 4 spots occupied, nobody can join
        filledSpots = reservation.totalSpots ?? 4;
        openSpots = 0;
      } else {
        // own_spot or legacy single-player: spots based on actual player rows
        // (legacy: at least 1 filled even if no player rows yet)
        filledSpots = isLegacyFullCourt
          ? Math.max(1, reservation.players.length)
          : reservation.players.length;
        openSpots = Math.max(0, (reservation.totalSpots ?? 4) - filledSpots);
      }

      // Player data: admin sees full detail; others see name + own userId only
      const players = reservation.players.map((p: any) => {
        const isOwn = p.userId === dbUserId;
        return {
          id: p.id,
          name: displayName(p.user, isAdmin || isOwn, "Player"),
          userId: isAdmin || isOwn ? p.userId : null,
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
          ? displayName(reservation.user, isAdmin || reservation.userId === dbUserId, "Player")
          : isAdmin
            ? (reservation.guestName ?? "Guest")
            : "Guest",
        seriesId: reservation.seriesId ?? null,
        ...price,
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
        seriesId: null,
        ...price,
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

  const allTerrains = await db.select().from(terrainsTable).where(eq(terrainsTable.isActive, true));

  let terrains = allTerrains;
  if (terrainIds) {
    const ids = terrainIds.split(",").map(Number).filter(Boolean);
    terrains = allTerrains.filter((t) => ids.includes(t.id));
  }

  if (terrains.length === 0) {
    res.json({ date, endDate: endDate || undefined, terrains: [] });
    return;
  }

  const dayStart = new Date(startDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(rangeEnd);
  dayEnd.setHours(23, 59, 59, 999);

  const tids = terrains.map((t) => t.id);

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
  const rules = await loadActiveRules();

  // Build result: for each terrain, collect slots across the entire date range
  const result = terrains.map((terrain) => {
    const terrainReservations = reservations.filter((r) => r.terrainId === terrain.id);
    const allSlots: object[] = [];

    // Iterate each day in the range
    const cursor = new Date(startDate);
    while (cursor <= rangeEnd) {
      const dayReservations = terrainReservations.filter((r) => {
        const d = r.startTime;
        return (
          d.getFullYear() === cursor.getFullYear() &&
          d.getMonth() === cursor.getMonth() &&
          d.getDate() === cursor.getDate()
        );
      });

      const daySlots = buildSlotsForTerrainDay(
        terrain,
        dayReservations,
        cursor,
        now,
        currentUserId,
        isAdmin,
        rules,
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
