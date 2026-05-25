import { Router } from "express";
import { db, reservationsTable, terrainsTable, usersTable, tokenTransactionsTable, notificationsTable, activityTable } from "@workspace/db";
import { eq, and, gte, gt, lt, lte, desc, count, sql } from "drizzle-orm";
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

  // Resolve who the reservation is for:
  // - Admin with explicit userId → book for that member
  // - Admin with no userId → guest/manual booking (no user account, no token deduction)
  // - Regular player → always book for themselves
  let targetUser: typeof currentUser | null;
  if (currentUser.role === "admin") {
    if (bodyUserId) {
      const [found] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(bodyUserId)));
      targetUser = found ?? null;
    } else {
      targetUser = null; // true guest booking
    }
  } else {
    targetUser = currentUser;
  }

  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, parseInt(terrainId)));
  if (!terrain) {
    res.status(400).json({ error: "Terrain not found" });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  // 4 tokens per 90-min court session (1 token per person, 4 players per court)
  const tokensNeeded = 4;
  // Only check token balance for member bookings (not guest/manual)
  if (targetUser && targetUser.tokenBalance < tokensNeeded) {
    res.status(400).json({ error: "Insufficient tokens" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const conflict = await tx.select().from(reservationsTable).where(
        and(
          eq(reservationsTable.terrainId, terrain.id),
          eq(reservationsTable.status, "confirmed" as any),
          lt(reservationsTable.startTime, end),
          gt(reservationsTable.endTime, start)
        )
      );
      if (conflict.length > 0) {
        throw new Error("SLOT_CONFLICT");
      }

      if (targetUser) {
        const [freshUser] = await tx.select().from(usersTable).where(eq(usersTable.id, targetUser.id)).for("update");
        if (!freshUser || freshUser.tokenBalance < tokensNeeded) {
          throw new Error("INSUFFICIENT_TOKENS");
        }
        const newBalance = freshUser.tokenBalance - tokensNeeded;
        await tx.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, freshUser.id));

        const [reservation] = await tx.insert(reservationsTable).values({
          terrainId: terrain.id,
          userId: freshUser.id,
          guestName,
          guestPhone,
          startTime: start,
          endTime: end,
          status: "confirmed",
          tokensCharged: tokensNeeded,
          bookingType: bookingType as any,
          notes,
        }).returning();

        await tx.insert(tokenTransactionsTable).values({
          userId: freshUser.id,
          adminId: currentUser.role === "admin" ? currentUser.id : null,
          reservationId: reservation.id,
          type: "debit",
          amount: tokensNeeded,
          balanceAfter: newBalance,
          description: `Reservation: ${terrain.name} on ${start.toLocaleDateString()}`,
        });

        await tx.insert(notificationsTable).values({
          userId: freshUser.id,
          type: "booking_confirmed",
          title: "Reservation Confirmed",
          message: `Your booking for ${terrain.name} on ${start.toLocaleDateString()} at ${start.toLocaleTimeString()} is confirmed.`,
        });

        await tx.insert(activityTable).values({
          type: "reservation_created",
          message: `Reservation created for ${terrain.name}`,
          userId: freshUser.id,
          userName: `${freshUser.firstName ?? ""} ${freshUser.lastName ?? ""}`.trim() || freshUser.email,
        });

        return reservation;
      } else {
        const [reservation] = await tx.insert(reservationsTable).values({
          terrainId: terrain.id,
          userId: null,
          guestName,
          guestPhone,
          startTime: start,
          endTime: end,
          status: "confirmed",
          tokensCharged: 0,
          bookingType: "manual" as any,
          notes,
        }).returning();

        await tx.insert(activityTable).values({
          type: "reservation_created",
          message: `Reservation created for ${terrain.name}`,
          userId: null,
          userName: guestName ?? "Guest",
        });

        return reservation;
      }
    });

    const full = await db.query.reservationsTable.findFirst({
      where: eq(reservationsTable.id, result.id),
      with: { terrain: true, user: true },
    });
    res.status(201).json(full);
  } catch (err: any) {
    if (err.message === "SLOT_CONFLICT") {
      res.status(409).json({ error: "Slot already booked" });
    } else if (err.message === "INSUFFICIENT_TOKENS") {
      res.status(400).json({ error: "Insufficient tokens" });
    } else {
      throw err;
    }
  }
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

  // Pre-fetch to validate access before entering transaction
  const check = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { terrain: true, user: true },
  });
  if (!check) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "admin" && check.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the row and atomically transition status only if still confirmed
      const [locked] = await tx.select().from(reservationsTable)
        .where(and(eq(reservationsTable.id, id), eq(reservationsTable.status, "confirmed" as any)))
        .for("update");

      if (!locked) {
        throw new Error("ALREADY_CANCELLED");
      }

      const [updated] = await tx.update(reservationsTable)
        .set({ status: "cancelled" })
        .where(eq(reservationsTable.id, id))
        .returning();

      if (locked.userId) {
        const [targetUser] = await tx.select().from(usersTable)
          .where(eq(usersTable.id, locked.userId)).for("update");
        if (targetUser) {
          const newBalance = targetUser.tokenBalance + locked.tokensCharged;
          await tx.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, targetUser.id));
          await tx.insert(tokenTransactionsTable).values({
            userId: targetUser.id,
            reservationId: id,
            type: "credit",
            amount: locked.tokensCharged,
            balanceAfter: newBalance,
            description: `Cancellation refund: ${check.terrain?.name ?? "terrain"}`,
          });
          await tx.insert(notificationsTable).values({
            userId: targetUser.id,
            type: "booking_cancelled",
            title: "Reservation Cancelled",
            message: `Your booking has been cancelled. ${locked.tokensCharged} token(s) refunded.`,
          });
        }
      }

      return { updated, userName: check.user ? `${check.user.firstName ?? ""} ${check.user.lastName ?? ""}`.trim() || check.user.email : null };
    });

    await db.insert(activityTable).values({
      type: "reservation_cancelled",
      message: `Reservation cancelled for ${check.terrain?.name ?? "terrain"}`,
      userId: check.userId,
      userName: result.userName,
    });

    res.json(result.updated);
  } catch (err: any) {
    if (err.message === "ALREADY_CANCELLED") {
      res.status(400).json({ error: "Already cancelled" });
    } else {
      throw err;
    }
  }
});

export default router;
