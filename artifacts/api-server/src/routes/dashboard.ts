import { Router } from "express";
import {
  db,
  reservationsTable,
  usersTable,
  tokenTransactionsTable,
  activityTable,
  terrainsTable,
} from "@workspace/db";
import { gte, lt, count, and, sql, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { loadActiveRules, priceFor } from "../lib/pricing";
import { dayHours, gridStarts } from "../lib/slots";
import { getSettings, scheduleContext } from "../lib/settings";
import { addDays, clubInstant, clubParts, isClubDate } from "../lib/club-time";
import { env } from "../config/env";
import { countUpcomingBookings, isBlockedSlot } from "../lib/bookings";
import { HttpError, paging } from "../lib/http";

const router = Router();

/** Bookable slots per club date across bookable courts (settings duration, hours, exceptions). */
async function slotsPerDay(from: string, to: string) {
  const courts = await db
    .select()
    .from(terrainsTable)
    .where(
      and(
        eq(terrainsTable.isActive, true),
        eq(terrainsTable.isMaintenance, false),
        isNull(terrainsTable.archivedAt),
      ),
    );
  const ctx = await scheduleContext(from, to);
  const out = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    let n = 0;
    for (const c of courts)
      n += gridStarts(
        dayHours(ctx.hours, ctx.exceptions, c, d),
        d,
        ctx.settings.bookingDurationMinutes,
      ).length;
    out.set(d, n);
  }
  return out;
}

/** Court value of the confirmed bookings in [from, to) at desk prices: full court price, or spots taken × spot price. */
async function bookedValue(from: Date, to: Date) {
  const rows = await db.query.reservationsTable.findMany({
    where: and(
      gte(reservationsTable.startTime, from),
      lt(reservationsTable.startTime, to),
      eq(reservationsTable.status, "confirmed"),
    ),
    with: { terrain: true, players: { columns: { id: true } } },
  });
  const [rules, settings] = await Promise.all([loadActiveRules(), getSettings()]);
  let total = 0;
  for (const r of rows) {
    if (!r.terrain || isBlockedSlot(r)) continue; // maintenance blocks earn nothing
    const p = priceFor(rules, settings, r.terrain, r.startTime);
    total +=
      r.bookingMode === "full_court" ? p.fullCourtPrice : r.players.length * p.pricePerPerson;
  }
  return { count: rows.length, value: Math.round(total) };
}

router.get("/dashboard/stats", requireAdmin, async (req, res) => {
  const { date } = req.query as Record<string, string>;
  const today = isClubDate(date) ? date : clubParts(new Date()).date;
  const monthFirst = `${today.slice(0, 7)}-01`;
  const [y, m] = monthFirst.split("-").map(Number);
  const nextMonthFirst = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const [day, month, perDay] = await Promise.all([
    bookedValue(clubInstant(today, 0), clubInstant(addDays(today, 1), 0)),
    bookedValue(clubInstant(monthFirst, 0), clubInstant(nextMonthFirst, 0)),
    slotsPerDay(today, today).then((m) => m.get(today) ?? 0),
  ]);
  const [{ activeUsers }] = await db
    .select({ activeUsers: count() })
    .from(usersTable)
    .where(isNull(usersTable.deletedAt));
  const [{ tokensIssued }] = await db
    .select({ tokensIssued: sql<number>`coalesce(sum(${tokenTransactionsTable.amount}), 0)` })
    .from(tokenTransactionsTable)
    .where(
      and(eq(tokenTransactionsTable.type, "credit"), isNotNull(tokenTransactionsTable.adminId)),
    );
  const upcoming = await countUpcomingBookings();

  res.json({
    totalReservationsToday: day.count,
    totalReservationsThisMonth: month.count,
    activeUsers: Number(activeUsers),
    // Tokens sold at the desk (admin credits; refunds excluded)
    totalTokensIssued: Number(tokensIssued),
    occupancyRateToday: perDay ? Number(Math.min(100, (day.count / perDay) * 100).toFixed(1)) : 0,
    upcomingReservations: upcoming,
    revenueEquivalentToday: day.value,
    revenueEquivalentMonth: month.value,
    slotsPerDay: perDay,
  });
});

router.get("/dashboard/peak-hours", requireAdmin, async (_req, res) => {
  // start_time is stored in UTC: convert to club-local time before bucketing
  const tz = env.clubTimezone;
  const rows = await db.execute<{ hour: number; day_of_week: number; booking_count: number }>(sql`
    select extract(hour from (start_time at time zone 'UTC') at time zone ${tz})::int as hour,
           extract(dow from (start_time at time zone 'UTC') at time zone ${tz})::int as day_of_week,
           count(*)::int as booking_count
    from reservations
    where status = 'confirmed'
    group by 1, 2
    order by 2, 1
  `);
  res.json(
    rows.rows.map((r) => ({
      hour: r.hour,
      dayOfWeek: r.day_of_week,
      bookingCount: r.booking_count,
    })),
  );
});

router.get("/dashboard/activity", requireAdmin, async (req, res) => {
  const { limit } = paging(req.query as Record<string, string>, 20, 100);
  const activities = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(limit);
  res.json(activities);
});

router.get("/dashboard/occupancy", requireAdmin, async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const to = isClubDate(endDate) ? endDate : clubParts(new Date()).date;
  const from = isClubDate(startDate) ? startDate : addDays(to, -30);
  if (from > to || addDays(from, 366) < to)
    throw new HttpError(400, "Invalid date range", "VALIDATION_ERROR");
  const tz = env.clubTimezone;
  const perDay = await slotsPerDay(from, to);
  const rows = await db.execute<{ date: string; booked_slots: number }>(sql`
    select to_char((start_time at time zone 'UTC') at time zone ${tz}, 'YYYY-MM-DD') as date,
           count(*)::int as booked_slots
    from reservations
    where status = 'confirmed' and start_time >= ${clubInstant(from, 0)} and start_time < ${clubInstant(addDays(to, 1), 0)}
    group by 1
    order by 1
  `);
  res.json(
    rows.rows.map((r) => {
      const total = perDay.get(r.date) ?? 0;
      return {
        date: r.date,
        totalSlots: total,
        bookedSlots: r.booked_slots,
        occupancyRate: total ? Number(Math.min(100, (r.booked_slots / total) * 100).toFixed(1)) : 0,
      };
    }),
  );
});

export default router;
