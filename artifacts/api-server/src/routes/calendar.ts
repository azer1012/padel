import { Router } from "express";
import { db, terrainsTable, reservationsTable } from "@workspace/db";
import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { loadUser } from "../lib/auth";
import { loadActiveRules, priceFor, type SlotPrice } from "../lib/pricing";
import { scheduleContext, type ClubSettings } from "../lib/settings";
import { dayHours, gridStarts } from "../lib/slots";
import { addDays, clubInstant, clubParts, isClubDate } from "../lib/club-time";
import { HttpError } from "../lib/http";

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

type CalendarReservation = Awaited<ReturnType<typeof loadReservations>>[number];

function loadReservations(tids: number[], from: Date, to: Date) {
  return db.query.reservationsTable.findMany({
    where: and(
      inArray(reservationsTable.terrainId, tids),
      lt(reservationsTable.startTime, to),
      gt(reservationsTable.endTime, from),
      eq(reservationsTable.status, "confirmed"),
    ),
    with: {
      players: { with: { user: true } },
      user: true,
    },
  });
}

type CalendarSlot = ReturnType<typeof reservationSlot> | ReturnType<typeof freeSlot>;

type Viewer = { userId: number | null; isAdmin: boolean; now: Date; settings: ClubSettings };

function priceFields(p: SlotPrice) {
  return {
    tokensPerSpot: p.tokensPerSpot,
    tokensFullCourt: p.tokensFullCourt,
    pricePerPerson: p.pricePerPerson,
    fullCourtPrice: p.fullCourtPrice,
    isPeak: p.isPeak,
    priceLabel: p.ruleName,
  };
}

function reservationSlot(reservation: CalendarReservation, v: Viewer, price: SlotPrice) {
  const { userId, isAdmin } = v;
  // full_court: the booker holds every spot (invited friends fill them for free);
  // own_spot: only the players who joined.
  const isFullCourt = reservation.bookingMode === "full_court";
  const filledSpots = isFullCourt ? reservation.totalSpots : reservation.players.length;
  const openSpots = isFullCourt ? 0 : Math.max(0, reservation.totalSpots - filledSpots);
  const invitedSeats = isFullCourt
    ? Math.max(0, reservation.totalSpots - reservation.players.length)
    : 0;
  const isMine =
    userId != null &&
    (reservation.userId === userId || reservation.players.some((p) => p.userId === userId));

  // Admin and the match's own players see payment states; outsiders see first names only.
  const players = reservation.players.map((p) => {
    const isOwn = p.userId === userId;
    return {
      id: p.id,
      name: displayName(p.user, isAdmin || isOwn, "Player"),
      userId: isAdmin || isOwn ? p.userId : null,
      paymentType: isAdmin || isMine ? p.paymentType : null,
      paymentStatus: isAdmin || isMine ? p.paymentStatus : null,
    };
  });

  return {
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    status: openSpots <= 0 ? "full" : "partial",
    isPast: reservation.startTime <= v.now,
    bookable: false,
    reservationId: reservation.id,
    bookingMode: reservation.bookingMode,
    totalSpots: reservation.totalSpots,
    filledSpots,
    openSpots,
    invitedSeats,
    isMine,
    isOrganizer: userId != null && reservation.userId === userId,
    isBlocked: !reservation.userId && (reservation.guestName ?? "").startsWith("["),
    isPublic: reservation.isPublic,
    publicDescription: reservation.publicDescription,
    players,
    creatorName: reservation.user
      ? displayName(reservation.user, isAdmin || reservation.userId === userId, "Player")
      : isAdmin
        ? (reservation.guestName ?? "Guest")
        : "Guest",
    guestPhone: isAdmin ? reservation.guestPhone : null,
    notes: isAdmin ? reservation.notes : null,
    seriesId: reservation.seriesId ?? null,
    ...priceFields(price),
  };
}

function freeSlot(start: Date, end: Date, v: Viewer, price: SlotPrice, courtBookable: boolean) {
  const isPast = start <= v.now;
  const t = start.getTime(),
    now = v.now.getTime();
  const inWindow =
    t > now + v.settings.minAdvanceMinutes * 60_000 &&
    t <= now + v.settings.maxAdvanceDays * 86_400_000;
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    status: isPast ? "past" : "available",
    isPast,
    // What this viewer may book right now (admins ignore the advance-booking window)
    bookable: courtBookable && !isPast && (v.isAdmin || inWindow),
    reservationId: null,
    bookingMode: null,
    totalSpots: v.settings.maxPlayers,
    filledSpots: 0,
    openSpots: v.settings.maxPlayers,
    invitedSeats: 0,
    isMine: false,
    isOrganizer: false,
    isBlocked: false,
    isPublic: false,
    publicDescription: null,
    players: [],
    creatorName: null,
    guestPhone: null,
    notes: null,
    seriesId: null,
    ...priceFields(price),
  };
}

router.get("/calendar", loadUser, async (req, res) => {
  const { date, endDate, terrainIds } = req.query as Record<string, string | undefined>;
  if (!isClubDate(date))
    throw new HttpError(400, "date is required (YYYY-MM-DD)", "VALIDATION_ERROR");

  // Single day or a range of up to 7 days
  let last = date;
  if (isClubDate(endDate) && endDate > date) {
    const cap = addDays(date, 6);
    last = endDate <= cap ? endDate : cap;
  }

  const dbUser = (req as any).dbUser as { id: number; role: string } | undefined;
  const isAdmin = dbUser?.role === "admin";

  let terrains = await db
    .select()
    .from(terrainsTable)
    .where(and(eq(terrainsTable.isActive, true), isNull(terrainsTable.archivedAt)))
    .orderBy(asc(terrainsTable.sortOrder), asc(terrainsTable.id));
  if (terrainIds) {
    const ids = terrainIds.split(",").map(Number).filter(Boolean);
    terrains = terrains.filter((t) => ids.includes(t.id));
  }
  if (terrains.length === 0) {
    res.json({ date, endDate: endDate || undefined, terrains: [] });
    return;
  }

  const ctx = await scheduleContext(date, last);
  const rules = await loadActiveRules();
  const reservations = await loadReservations(
    terrains.map((t) => t.id),
    clubInstant(date, 0),
    clubInstant(addDays(last, 1), 0),
  );
  const v: Viewer = {
    userId: dbUser?.id ?? null,
    isAdmin,
    now: new Date(),
    settings: ctx.settings,
  };
  const duration = ctx.settings.bookingDurationMinutes * 60_000;

  const result = terrains.map((terrain) => {
    const mine = reservations.filter((r) => r.terrainId === terrain.id);
    const slots: CalendarSlot[] = [];
    const closures: { date: string; reason: string | null }[] = [];

    for (let day = date; day <= last; day = addDays(day, 1)) {
      const h = dayHours(ctx.hours, ctx.exceptions, terrain, day);
      if (h.closed) closures.push({ date: day, reason: h.reason });
      const dayReservations = mine.filter((r) => clubParts(r.startTime).date === day);
      const daySlots: CalendarSlot[] = dayReservations.map((r) =>
        reservationSlot(r, v, priceFor(rules, ctx.settings, terrain, r.startTime)),
      );
      // Grid slots that don't overlap any booking (bookings made before a duration
      // change keep their own times, so overlap — not equal start — decides).
      for (const start of gridStarts(h, day, ctx.settings.bookingDurationMinutes)) {
        const end = new Date(start.getTime() + duration);
        if (mine.some((r) => r.startTime < end && r.endTime > start)) continue;
        daySlots.push(
          freeSlot(
            start,
            end,
            v,
            priceFor(rules, ctx.settings, terrain, start),
            !terrain.isMaintenance,
          ),
        );
      }
      daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      slots.push(...daySlots);
    }

    return {
      terrain: {
        id: terrain.id,
        name: terrain.name,
        number: terrain.number,
        type: terrain.type,
        description: terrain.description,
        photos: terrain.photos,
        isMaintenance: terrain.isMaintenance,
        maintenanceNote: terrain.maintenanceNote,
        pricePerPerson: terrain.pricePerPerson ?? ctx.settings.playerPrice,
      },
      closures,
      slots,
    };
  });

  res.json({ date, endDate: endDate || undefined, terrains: result });
});

export default router;
