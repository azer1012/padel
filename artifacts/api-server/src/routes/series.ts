import { Router } from "express";
import {
  db,
  reservationSeriesTable,
  reservationsTable,
  reservationPlayersTable,
  reservationEquipmentTable,
  terrainsTable,
  usersTable,
  activityTable,
  type Queryable,
} from "@workspace/db";
import { and, desc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { currentUser, requireAdmin } from "../lib/auth";
import { fullName } from "../lib/members";
import { assertBookable, toMinutes, type ScheduleContext } from "../lib/slots";
import { scheduleContext } from "../lib/settings";
import { addDays, clubInstant, clubParts } from "../lib/club-time";
import { HttpError, cleanText, pgCode, requireId, toId, type Body } from "../lib/http";

const router = Router();

type SeriesInput = {
  terrainId: number;
  firstStart: Date;
  occurrences: number;
  intervalWeeks: number;
};

function parse(body: Body): SeriesInput {
  const firstStart = new Date(String(body?.firstStart ?? ""));
  const occurrences = Number(body?.occurrences),
    intervalWeeks = Number(body?.intervalWeeks ?? 1),
    terrainId = requireId(body?.terrainId, "court");
  const bad = (message: string): never => {
    throw new HttpError(400, message, "VALIDATION_ERROR");
  };
  if (Number.isNaN(firstStart.getTime())) bad("Invalid first date");
  if (firstStart.getTime() < Date.now()) bad("First date must be in the future");
  if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 52)
    bad("Between 2 and 52 sessions");
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 4)
    bad("Repeat every 1 to 4 weeks");
  return { terrainId, firstStart, occurrences, intervalWeeks };
}

/** Same club wall-clock time each week, whatever timezone the server runs in (and across DST changes). */
function sessionStarts(s: SeriesInput) {
  const { date, time } = clubParts(s.firstStart);
  return Array.from({ length: s.occurrences }, (_, i) =>
    clubInstant(addDays(date, i * 7 * s.intervalWeeks), toMinutes(time)),
  );
}

async function loadCourt(terrainId: number) {
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, terrainId));
  if (!terrain) throw new HttpError(400, "Court not available", "COURT_UNAVAILABLE");
  return terrain;
}

const contextFor = (starts: Date[]) =>
  scheduleContext(clubParts(starts[0]).date, clubParts(starts[starts.length - 1]).date);

/** Sessions that are not real slots (closed day, outside hours, maintenance): index → reason. */
function unbookableSessions(
  ctx: ScheduleContext,
  terrain: Awaited<ReturnType<typeof loadCourt>>,
  starts: Date[],
) {
  const out = new Map<number, string>();
  starts.forEach((start, i) => {
    try {
      assertBookable(ctx, terrain, start, { isAdmin: true });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      out.set(i, err.message);
    }
  });
  return out;
}

/** Sessions that overlap an existing confirmed booking: index → who holds the slot. */
async function bookedSessions(q: Queryable, terrainId: number, starts: Date[], slotMs: number) {
  const out = new Map<number, string>();
  if (!starts.length) return out;
  const first = starts[0],
    last = new Date(starts[starts.length - 1].getTime() + slotMs);
  const existing = await q
    .select({
      startTime: reservationsTable.startTime,
      endTime: reservationsTable.endTime,
      guestName: reservationsTable.guestName,
      userId: reservationsTable.userId,
    })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.terrainId, terrainId),
        eq(reservationsTable.status, "confirmed"),
        lt(reservationsTable.startTime, last),
        gt(reservationsTable.endTime, first),
      ),
    );
  starts.forEach((start, i) => {
    const end = start.getTime() + slotMs;
    const hit = existing.find(
      (r) => r.startTime.getTime() < end && r.endTime.getTime() > start.getTime(),
    );
    if (hit) out.set(i, hit.guestName ?? (hit.userId ? `member #${hit.userId}` : "booked"));
  });
  return out;
}

router.post("/admin/series/preview", requireAdmin, async (req, res) => {
  const s = parse(req.body);
  const starts = sessionStarts(s);
  const terrain = await loadCourt(s.terrainId);
  const ctx = await contextFor(starts);
  const slotMs = ctx.settings.bookingDurationMinutes * 60_000;
  // A booked date reports who holds it; otherwise the reason the slot is not bookable
  const problems = new Map([
    ...unbookableSessions(ctx, terrain, starts),
    ...(await bookedSessions(db, s.terrainId, starts, slotMs)),
  ]);
  res.json({
    dates: starts.map((start, i) => ({
      startTime: start.toISOString(),
      conflict: problems.has(i),
      conflictWith: problems.get(i) ?? null,
    })),
  });
});

router.post("/admin/series", requireAdmin, async (req, res) => {
  const admin = currentUser(req);
  const s = parse(req.body);
  const userId = toId(req.body?.userId);
  const guestName = cleanText(req.body?.guestName, 80);
  const guestPhone = cleanText(req.body?.guestPhone, 30);
  const label = cleanText(req.body?.label, 80);
  const notes = cleanText(req.body?.notes, 500);
  const skipConflicts = req.body?.skipConflicts !== false;

  const terrain = await loadCourt(s.terrainId);
  const starts = sessionStarts(s);
  const ctx = await contextFor(starts);
  const slotMs = ctx.settings.bookingDurationMinutes * 60_000;
  // The first session must be bookable; later ones that are not (closed day, holiday,
  // maintenance) are skipped like the dates already taken
  assertBookable(ctx, terrain, starts[0], { isAdmin: true });
  const unbookable = unbookableSessions(ctx, terrain, starts);

  const [member] = userId
    ? await db.select().from(usersTable).where(eq(usersTable.id, userId))
    : [];
  if (userId && !member) throw new HttpError(404, "Member not found", "USER_NOT_FOUND");
  if (!member && !guestName)
    throw new HttpError(400, "Pick a member or enter a name", "VALIDATION_ERROR");

  let out;
  try {
    out = await db.transaction(async (tx) => {
      // Serialize series creation per court
      await tx
        .select({ id: terrainsTable.id })
        .from(terrainsTable)
        .where(eq(terrainsTable.id, terrain.id))
        .for("update");
      const skip = new Map([
        ...(await bookedSessions(tx, terrain.id, starts, slotMs)),
        ...unbookable,
      ]);
      if (skip.size && !skipConflicts)
        throw new HttpError(409, `${skip.size} date(s) are already booked`, "SERIES_CONFLICTS", {
          conflicts: skip.size,
        });
      const [series] = await tx
        .insert(reservationSeriesTable)
        .values({
          terrainId: terrain.id,
          userId: member?.id ?? null,
          guestName: member ? null : guestName,
          guestPhone,
          label,
          firstStart: s.firstStart,
          occurrences: s.occurrences,
          intervalWeeks: s.intervalWeeks,
          notes,
          createdBy: admin.id,
        })
        .returning();
      const created: string[] = [],
        skipped: string[] = [];
      for (const [i, start] of starts.entries()) {
        if (skip.has(i)) {
          skipped.push(start.toISOString());
          continue;
        }
        const [reservation] = await tx
          .insert(reservationsTable)
          .values({
            terrainId: terrain.id,
            userId: member?.id ?? null,
            guestName: member ? null : guestName,
            guestPhone,
            startTime: start,
            endTime: new Date(start.getTime() + slotMs),
            status: "confirmed",
            tokensCharged: 0,
            bookingType: "manual",
            bookingMode: "full_court",
            totalSpots: ctx.settings.maxPlayers,
            isPublic: false,
            notes: [label, notes].filter(Boolean).join(" · ") || null,
            seriesId: series.id,
          })
          .returning();
        // Paid at the desk each week: one pending cash row so staff can tick it off per session
        if (member)
          await tx.insert(reservationPlayersTable).values({
            reservationId: reservation.id,
            userId: member.id,
            paymentType: "cash_club",
            paymentStatus: "pending",
            tokensCharged: 0,
          });
        created.push(start.toISOString());
      }
      await tx.insert(activityTable).values({
        type: "reservation_created",
        message: `Recurring booking: ${terrain.name}, ${created.length} sessions${label ? ` (${label})` : ""} (by ${admin.email})`,
        userId: member?.id ?? null,
        userName: member ? fullName(member) : guestName,
      });
      return { series, created, skipped };
    });
  } catch (err) {
    // A date taken between the check above and the insert: the database refuses the overlap
    if (["23505", "23P01"].includes(pgCode(err) ?? ""))
      throw new HttpError(409, "A date was booked meanwhile, please preview again", "SLOT_TAKEN");
    throw err;
  }
  res.status(201).json(out);
});

router.get("/admin/series", requireAdmin, async (_req, res) => {
  const list = await db.query.reservationSeriesTable.findMany({
    where: eq(reservationSeriesTable.status, "active"),
    with: { terrain: true, user: true },
    orderBy: [desc(reservationSeriesTable.createdAt)],
  });
  if (!list.length) {
    res.json([]);
    return;
  }
  const upcoming = await db
    .select({ seriesId: reservationsTable.seriesId, startTime: reservationsTable.startTime })
    .from(reservationsTable)
    .where(
      and(
        inArray(
          reservationsTable.seriesId,
          list.map((s) => s.id),
        ),
        eq(reservationsTable.status, "confirmed"),
        gte(reservationsTable.startTime, new Date()),
      ),
    );
  res.json(
    list.map((s) => {
      const sessions = upcoming
        .filter((u) => u.seriesId === s.id)
        .map((u) => u.startTime)
        .sort((a, b) => +a - +b);
      return {
        id: s.id,
        label: s.label,
        terrain: s.terrain ? { id: s.terrain.id, name: s.terrain.name } : null,
        who: s.user ? fullName(s.user) : s.guestName,
        guestPhone: s.guestPhone,
        firstStart: s.firstStart,
        occurrences: s.occurrences,
        intervalWeeks: s.intervalWeeks,
        remaining: sessions.length,
        nextStart: sessions[0] ?? null,
      };
    }),
  );
});

/** Cancels the remaining (future) sessions. Past sessions stay in history. */
router.post("/admin/series/:id/cancel", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [series] = await db
    .select({ id: reservationSeriesTable.id })
    .from(reservationSeriesTable)
    .where(eq(reservationSeriesTable.id, id));
  if (!series) throw new HttpError(404, "Recurring booking not found", "NOT_FOUND");
  const cancelled = await db.transaction(async (tx) => {
    const future = await tx
      .update(reservationsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(reservationsTable.seriesId, id),
          eq(reservationsTable.status, "confirmed"),
          gt(reservationsTable.startTime, new Date()),
        ),
      )
      .returning({ id: reservationsTable.id });
    if (future.length) {
      await tx
        .update(reservationEquipmentTable)
        .set({ status: "cancelled" })
        .where(
          and(
            inArray(
              reservationEquipmentTable.reservationId,
              future.map((f) => f.id),
            ),
            eq(reservationEquipmentTable.status, "reserved"),
          ),
        );
    }
    await tx
      .update(reservationSeriesTable)
      .set({ status: "cancelled" })
      .where(eq(reservationSeriesTable.id, id));
    return future.length;
  });
  res.json({ cancelled });
});

export default router;
