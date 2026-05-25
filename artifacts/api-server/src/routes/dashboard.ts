import { Router } from "express";
import { db, reservationsTable, usersTable, tokenTransactionsTable, activityTable } from "@workspace/db";
import { eq, gte, lt, lte, count, and, sql, desc } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/dashboard/stats", requireAdmin, async (req, res) => {
  const { date } = req.query as Record<string, string>;
  const today = date ? new Date(date) : new Date();
  const todayStart = new Date(today); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(today); todayEnd.setHours(23,59,59,999);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const [{ todayCount }] = await db.select({ todayCount: count() }).from(reservationsTable)
    .where(and(gte(reservationsTable.startTime, todayStart), lte(reservationsTable.startTime, todayEnd), eq(reservationsTable.status, "confirmed" as any)));

  const [{ monthCount }] = await db.select({ monthCount: count() }).from(reservationsTable)
    .where(and(gte(reservationsTable.startTime, monthStart), lte(reservationsTable.startTime, monthEnd), eq(reservationsTable.status, "confirmed" as any)));

  const [{ activeUsers }] = await db.select({ activeUsers: count() }).from(usersTable);

  const [{ tokensIssued }] = await db.select({ tokensIssued: sql<number>`COALESCE(SUM(${tokenTransactionsTable.amount}), 0)` }).from(tokenTransactionsTable)
    .where(eq(tokenTransactionsTable.type, "credit" as any));

  const [{ upcoming }] = await db.select({ upcoming: count() }).from(reservationsTable)
    .where(and(gte(reservationsTable.startTime, new Date()), eq(reservationsTable.status, "confirmed" as any)));

  const occupancyRate = todayCount > 0 ? Math.min((Number(todayCount) / 20) * 100, 100) : 0;

  res.json({
    totalReservationsToday: Number(todayCount),
    totalReservationsThisMonth: Number(monthCount),
    activeUsers: Number(activeUsers),
    totalTokensIssued: Number(tokensIssued),
    occupancyRateToday: Number(occupancyRate.toFixed(1)),
    upcomingReservations: Number(upcoming),
    revenueEquivalentToday: Number(todayCount) * 100,
    revenueEquivalentMonth: Number(monthCount) * 100,
  });
});

router.get("/dashboard/peak-hours", requireAdmin, async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM start_time)::int AS hour,
      EXTRACT(DOW FROM start_time)::int AS day_of_week,
      COUNT(*)::int AS booking_count
    FROM reservations
    WHERE status = 'confirmed'
    GROUP BY hour, day_of_week
    ORDER BY day_of_week, hour
  `);
  res.json(rows.rows.map((r: any) => ({
    hour: r.hour,
    dayOfWeek: r.day_of_week,
    bookingCount: r.booking_count,
  })));
});

router.get("/dashboard/activity", requireAdmin, async (req, res) => {
  const { limit = "20" } = req.query as Record<string, string>;
  const limitNum = parseInt(limit);
  const activities = await db.select().from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(limitNum);
  res.json(activities);
});

router.get("/dashboard/occupancy", requireAdmin, async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  const rows = await db.execute(sql`
    SELECT
      DATE(start_time) AS date,
      COUNT(*)::int AS booked_slots
    FROM reservations
    WHERE status = 'confirmed'
      AND start_time >= ${start}
      AND start_time <= ${end}
    GROUP BY DATE(start_time)
    ORDER BY date
  `);

  const result = rows.rows.map((r: any) => ({
    date: r.date instanceof Date ? r.date.toISOString().split("T")[0] : String(r.date),
    totalSlots: 20,
    bookedSlots: r.booked_slots,
    occupancyRate: Number(((r.booked_slots / 20) * 100).toFixed(1)),
  }));

  res.json(result);
});

export default router;
