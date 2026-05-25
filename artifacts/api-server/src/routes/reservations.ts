import { Router } from "express";
import { db, reservationsTable, terrainsTable, usersTable, tokenTransactionsTable, notificationsTable, activityTable } from "@workspace/db";
import { eq, and, gte, lt, lte, desc, count } from "drizzle-orm";
import { requireUser, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/reservations/upcoming", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const now = new Date();
  const reservations = await db.query.reservationsTable.findMany({
    where: and(
      eq(reservationsTable.userId, user.id),
      gte(reservationsTable.startTime, now),
      eq(reservationsTable.status, "confirmed" as any)
    ),
    with: { terrain: true, user: true },
    orderBy: [reservationsTable.startTime],
    limit: 10,
  });
  res.json(reservations);
});

router.get("/reservations", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const { date, terrainId, status, userId: queryUserId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];
  if (user.role !== "admin") {
    conditions.push(eq(reservationsTable.userId, user.id));
  } else if (queryUserId) {
    conditions.push(eq(reservationsTable.userId, parseInt(queryUserId)));
  }
  if (date) {
    const d = new Date(date);
    const start = new Date(d); start.setHours(0,0,0,0);
    const end = new Date(d); end.setHours(23,59,59,999);
    conditions.push(gte(reservationsTable.startTime, start));
    conditions.push(lte(reservationsTable.startTime, end));
  }
  if (terrainId) conditions.push(eq(reservationsTable.terrainId, parseInt(terrainId)));
  if (status) conditions.push(eq(reservationsTable.status, status as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(reservationsTable)
    .where(whereClause);

  const data = await db.query.reservationsTable.findMany({
    where: whereClause,
    with: { terrain: true, user: true },
    orderBy: [desc(reservationsTable.createdAt)],
    limit: limitNum,
    offset,
  });

  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

router.post("/reservations", requireUser, async (req, res) => {
  const currentUser = (req as any).dbUser;
  const { terrainId, startTime, userId: bodyUserId, guestName, guestPhone, bookingType = "online", notes } = req.body;

  const targetUserId = currentUser.role === "admin" && bodyUserId ? parseInt(bodyUserId) : currentUser.id;
  const targetUser = targetUserId === currentUser.id ? currentUser : (await db.select().from(usersTable).where(eq(usersTable.id, targetUserId)))[0];

  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, parseInt(terrainId)));
  if (!terrain) {
    res.status(400).json({ error: "Terrain not found" });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  const conflict = await db.select().from(reservationsTable).where(
    and(
      eq(reservationsTable.terrainId, terrain.id),
      eq(reservationsTable.startTime, start),
      eq(reservationsTable.status, "confirmed" as any)
    )
  );
  if (conflict.length > 0) {
    res.status(409).json({ error: "Slot already booked" });
    return;
  }

  const tokensNeeded = 1;
  if (targetUser && targetUser.tokenBalance < tokensNeeded) {
    res.status(400).json({ error: "Insufficient tokens" });
    return;
  }

  const newBalance = (targetUser?.tokenBalance ?? 0) - tokensNeeded;
  if (targetUser) {
    await db.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, targetUser.id));
  }

  const [reservation] = await db.insert(reservationsTable).values({
    terrainId: terrain.id,
    userId: targetUser?.id ?? null,
    guestName,
    guestPhone,
    startTime: start,
    endTime: end,
    status: "confirmed",
    tokensCharged: tokensNeeded,
    bookingType: bookingType as any,
    notes,
  }).returning();

  if (targetUser) {
    await db.insert(tokenTransactionsTable).values({
      userId: targetUser.id,
      adminId: currentUser.role === "admin" ? currentUser.id : null,
      reservationId: reservation.id,
      type: "debit",
      amount: tokensNeeded,
      balanceAfter: newBalance,
      description: `Reservation: ${terrain.name} on ${start.toLocaleDateString()}`,
    });

    await db.insert(notificationsTable).values({
      userId: targetUser.id,
      type: "booking_confirmed",
      title: "Reservation Confirmed",
      message: `Your booking for ${terrain.name} on ${start.toLocaleDateString()} at ${start.toLocaleTimeString()} is confirmed.`,
    });
  }

  await db.insert(activityTable).values({
    type: "reservation_created",
    message: `Reservation created for ${terrain.name}`,
    userId: targetUser?.id ?? null,
    userName: targetUser ? `${targetUser.firstName ?? ""} ${targetUser.lastName ?? ""}`.trim() || targetUser.email : guestName ?? "Guest",
  });

  const full = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, reservation.id),
    with: { terrain: true, user: true },
  });
  res.status(201).json(full);
});

router.get("/reservations/:id", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const user = (req as any).dbUser;
  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { terrain: true, user: true },
  });
  if (!reservation) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "admin" && reservation.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(reservation);
});

router.patch("/reservations/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { status, notes } = req.body;
  const [updated] = await db.update(reservationsTable)
    .set({ status, notes })
    .where(eq(reservationsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.post("/reservations/:id/cancel", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const user = (req as any).dbUser;
  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { terrain: true, user: true },
  });
  if (!reservation) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "admin" && reservation.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (reservation.status === "cancelled") {
    res.status(400).json({ error: "Already cancelled" });
    return;
  }

  const [updated] = await db.update(reservationsTable)
    .set({ status: "cancelled" })
    .where(eq(reservationsTable.id, id))
    .returning();

  if (reservation.userId) {
    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, reservation.userId));
    if (targetUser) {
      const newBalance = targetUser.tokenBalance + reservation.tokensCharged;
      await db.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, targetUser.id));
      await db.insert(tokenTransactionsTable).values({
        userId: targetUser.id,
        reservationId: id,
        type: "credit",
        amount: reservation.tokensCharged,
        balanceAfter: newBalance,
        description: `Cancellation refund: ${reservation.terrain?.name ?? "terrain"}`,
      });
      await db.insert(notificationsTable).values({
        userId: targetUser.id,
        type: "booking_cancelled",
        title: "Reservation Cancelled",
        message: `Your booking has been cancelled. ${reservation.tokensCharged} token(s) refunded.`,
      });
    }
  }

  await db.insert(activityTable).values({
    type: "reservation_cancelled",
    message: `Reservation cancelled for ${reservation.terrain?.name ?? "terrain"}`,
    userId: reservation.userId,
    userName: reservation.user ? `${reservation.user.firstName ?? ""} ${reservation.user.lastName ?? ""}`.trim() || reservation.user.email : null,
  });

  res.json(updated);
});

export default router;
