import { Router } from "express";
import {
  db,
  reservationsTable,
  usersTable,
  tokenTransactionsTable,
  activityTable,
  terrainsTable,
} from "@workspace/db";
import { gte, lte, count, and, sql, desc, eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { loadActiveRules, priceFor, SPOTS_PER_COURT } from "../lib/pricing";
import { SLOT_MINUTES } from "../lib/slots";
import { env } from "../config/env";
import { paging } from "../lib/http";

const router = Router();

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Bookable 90-minute slots per day across all active courts. */
async function slotsPerDay() {
  const courts = await db.select().from(terrainsTable).where(eq(terrainsTable.isActive, true));
  return courts.reduce(
    (n, t) =>
      n + Math.max(0, Math.floor((minutes(t.closingTime) - minutes(t.openingTime)) / SLOT_MINUTES)),
    0,
  );
}

/** Court value of the confirmed bookings in a range (TND): full court = 4 spots, own spot = players in it. */
async function bookedValue(from: Date, to: Date) {
  const rows = await db.query.reservationsTable.findMany({
    where: and(
      gte(reservationsTable.startTime, from),
      lte(reservationsTable.startTime, to),
      eq(reservationsTable.status, "confirmed"),
    ),
    with: { terrain: true, players: { columns: { id: true } } },
  });
  const rules = await loadActiveRules();
  let total = 0;
  for (const r of rows) {
    if (!r.terrain || r.guestName?.startsWith("[")) continue; // maintenance blocks
    const spots = r.bookingMode === "full_court" ? SPOTS_PER_COURT : r.players.length;
    total += spots * priceFor(rules, r.terrain, r.startTime).pricePerPerson;
  }
  return { count: rows.length, value: Math.round(total) };
}

router.get("/dashboard/stats", requireAdmin, async (req, res) => {
  const { date } = req.query as Record<string, string>;
  const parsed = date ? new Date(date) : new Date();
  const today = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const [day, month, perDay] = await Promise.all([
    bookedValue(todayStart, todayEnd),
    bookedValue(monthStart, monthEnd),
    slotsPerDay(),
  ]);
  const [{ activeUsers }] = await db.select({ activeUsers: count() }).from(usersTable);
  const [{ tokensIssued }] = await db
    .select({ tokensIssued: sql<number>`coalesce(sum(${tokenTransactionsTable.amount}), 0)` })
    .from(tokenTransactionsTable)
    .where(
      and(
        eq(tokenTransactionsTable.type, "credit"),
        sql`${tokenTransactionsTable.adminId} is not null`,
      ),
    );
  const [{ upcoming }] = await db
    .select({ upcoming: count() })
    .from(reservationsTable)
    .where(
      and(gte(reservationsTable.startTime, new Date()), eq(reservationsTable.status, "confirmed")),
    );

  res.json({
    totalReservationsToday: day.count,
    totalReservationsThisMonth: month.count,
    activeUsers: Number(activeUsers),
    // Tokens sold at the desk (admin credits; refunds excluded)
    totalTokensIssued: Number(tokensIssued),
    occupancyRateToday: perDay ? Number(Math.min(100, (day.count / perDay) * 100).toFixed(1)) : 0,
    upcomingReservations: Number(upcoming),
    revenueEquivalentToday: day.value,
    revenueEquivalentMonth: month.value,
    slotsPerDay: perDay,
  });
});

router.get("/dashboard/peak-hours", requireAdmin, async (_req, res) => {
  // start_time is stored in UTC: convert to club-local time before bucketing
  const tz = env.clubTimezone;
  const rows = await db.execute(sql`
    select extract(hour from (start_time at time zone 'UTC') at time zone ${tz})::int as hour,
           extract(dow from (start_time at time zone 'UTC') at time zone ${tz})::int as day_of_week,
           count(*)::int as booking_count
    from reservations
    where status = 'confirmed'
    group by 1, 2
    order by 2, 1
  `);
  res.json(
    rows.rows.map((r: any) => ({
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
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 3600_000);
  const end = endDate ? new Date(endDate) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid date range", code: "VALIDATION_ERROR" });
    return;
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  const tz = env.clubTimezone;
  const perDay = await slotsPerDay();
  const rows = await db.execute(sql`
    select to_char((start_time at time zone 'UTC') at time zone ${tz}, 'YYYY-MM-DD') as date,
           count(*)::int as booked_slots
    from reservations
    where status = 'confirmed' and start_time >= ${start} and start_time <= ${end}
    group by 1
    order by 1
  `);
  res.json(
    rows.rows.map((r: any) => ({
      date: String(r.date),
      totalSlots: perDay,
      bookedSlots: r.booked_slots,
      occupancyRate: perDay ? Number(((r.booked_slots / perDay) * 100).toFixed(1)) : 0,
    })),
  );
});

export default router;
