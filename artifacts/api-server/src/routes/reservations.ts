import { Router } from "express";
import {
  db,
  reservationsTable,
  terrainsTable,
  usersTable,
  tokenTransactionsTable,
  notificationsTable,
  activityTable,
  reservationPlayersTable,
} from "@workspace/db";
import { eq, and, gte, gt, lt, lte, desc, count, inArray, or, sql } from "drizzle-orm";
import { requireUser, requireAdmin } from "../lib/auth";
import { quote, tokensFor } from "../lib/pricing";
import { notifyLater } from "../lib/notify";
import { formatClubDate, formatClubTime, type Lang } from "../lib/club-time";
import { EquipmentError, normalizeRequest, reserveEquipment } from "../lib/equipment";
import { reservationEquipmentTable, equipmentItemsTable } from "@workspace/db";

const router = Router();

router.get("/reservations/upcoming", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const now = new Date();

  // Include sessions where user is the creator OR a joined player
  const playerRows = await db
    .select({ reservationId: reservationPlayersTable.reservationId })
    .from(reservationPlayersTable)
    .where(eq(reservationPlayersTable.userId, user.id));
  const joinedIds = playerRows.map((r) => r.reservationId);

  const whereClause = and(
    gte(reservationsTable.startTime, now),
    eq(reservationsTable.status, "confirmed" as any),
    joinedIds.length > 0
      ? or(eq(reservationsTable.userId, user.id), inArray(reservationsTable.id, joinedIds))
      : eq(reservationsTable.userId, user.id),
  );

  const reservations = await db.query.reservationsTable.findMany({
    where: whereClause,
    with: {
      terrain: true,
      user: true,
      players: { with: { user: true } },
      equipment: { with: { item: true } },
    },
    orderBy: [reservationsTable.startTime],
    limit: 10,
  });
  res.json(reservations);
});

router.get("/reservations", requireUser, async (req, res) => {
  const user = (req as any).dbUser;
  const {
    date,
    terrainId,
    status,
    userId: queryUserId,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const conditions: any[] = [];

  if (user.role !== "admin") {
    // Include sessions where user is the creator OR a joined player
    const playerRows = await db
      .select({ reservationId: reservationPlayersTable.reservationId })
      .from(reservationPlayersTable)
      .where(eq(reservationPlayersTable.userId, user.id));
    const joinedIds = playerRows.map((r) => r.reservationId);

    if (joinedIds.length > 0) {
      conditions.push(
        or(eq(reservationsTable.userId, user.id), inArray(reservationsTable.id, joinedIds)),
      );
    } else {
      conditions.push(eq(reservationsTable.userId, user.id));
    }
  } else if (queryUserId) {
    conditions.push(eq(reservationsTable.userId, parseInt(queryUserId)));
  }

  if (date) {
    const d = new Date(date);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    conditions.push(gte(reservationsTable.startTime, start));
    conditions.push(lte(reservationsTable.startTime, end));
  }
  if (terrainId) conditions.push(eq(reservationsTable.terrainId, parseInt(terrainId)));
  if (status) conditions.push(eq(reservationsTable.status, status as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ total }] = await db
    .select({ total: count() })
    .from(reservationsTable)
    .where(whereClause);

  const data = await db.query.reservationsTable.findMany({
    where: whereClause,
    with: {
      terrain: true,
      user: true,
      players: { with: { user: true } },
      equipment: { with: { item: true } },
    },
    orderBy: [desc(reservationsTable.createdAt)],
    limit: limitNum,
    offset,
  });

  res.json({ data, total: Number(total), page: pageNum, limit: limitNum });
});

router.post("/reservations", requireUser, async (req, res) => {
  const currentUser = (req as any).dbUser;
  const {
    terrainId,
    startTime,
    userId: bodyUserId,
    guestName,
    guestPhone,
    bookingType = "online",
    bookingMode = "full_court",
    notes,
    isPublic = false,
    publicDescription,
  } = req.body;

  // Resolve target user
  let targetUser: typeof currentUser | null;
  if (currentUser.role === "admin") {
    if (bodyUserId) {
      const [found] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, parseInt(bodyUserId)));
      targetUser = found ?? null;
    } else {
      targetUser = null;
    }
  } else {
    targetUser = currentUser;
  }

  const [terrain] = await db
    .select()
    .from(terrainsTable)
    .where(eq(terrainsTable.id, parseInt(terrainId)));
  if (!terrain) {
    res.status(400).json({ error: "Terrain not found" });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  if (Number.isNaN(start.getTime())) {
    res.status(400).json({ error: "Invalid start time" });
    return;
  }
  if (start.getTime() < Date.now() - 5 * 60 * 1000 && currentUser.role !== "admin") {
    res.status(400).json({ error: "This slot is in the past" });
    return;
  }

  // Peak / off-peak pricing: own_spot = tokensPerSpot, full_court = 4 × tokensPerSpot
  const price = await quote(terrain, start);
  const tokensNeeded = tokensFor(price, bookingMode === "own_spot" ? "own_spot" : "full_court");
  const equipmentReq = normalizeRequest(req.body?.equipment);
  let gear: { name: string; quantity: number; price: number }[] = [];

  if (targetUser && targetUser.tokenBalance < tokensNeeded) {
    res.status(400).json({ error: "Insufficient tokens" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const conflict = await tx
        .select()
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.terrainId, terrain.id),
            eq(reservationsTable.status, "confirmed" as any),
            lt(reservationsTable.startTime, end),
            gt(reservationsTable.endTime, start),
          ),
        );
      if (conflict.length > 0) {
        throw new Error("SLOT_CONFLICT");
      }

      if (targetUser) {
        const [freshUser] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, targetUser.id))
          .for("update");
        if (!freshUser || freshUser.tokenBalance < tokensNeeded) {
          throw new Error("INSUFFICIENT_TOKENS");
        }
        const newBalance = freshUser.tokenBalance - tokensNeeded;
        await tx
          .update(usersTable)
          .set({ tokenBalance: newBalance })
          .where(eq(usersTable.id, freshUser.id));

        const [reservation] = await tx
          .insert(reservationsTable)
          .values({
            terrainId: terrain.id,
            userId: freshUser.id,
            guestName,
            guestPhone,
            startTime: start,
            endTime: end,
            status: "confirmed",
            tokensCharged: tokensNeeded,
            bookingType: bookingType as any,
            bookingMode: bookingMode as any,
            totalSpots: 4,
            isPublic: bookingMode === "own_spot" ? (isPublic ?? false) : false,
            publicDescription: bookingMode === "own_spot" ? (publicDescription ?? null) : null,
            notes,
          })
          .returning();

        // Creator row in reservation_players (source of truth for refunds)
        await tx.insert(reservationPlayersTable).values({
          reservationId: reservation.id,
          userId: freshUser.id,
          paymentType: "token",
          paymentStatus: "paid",
          tokensCharged: tokensNeeded,
        });

        await tx.insert(tokenTransactionsTable).values({
          userId: freshUser.id,
          adminId: currentUser.role === "admin" ? currentUser.id : null,
          reservationId: reservation.id,
          type: "debit",
          amount: tokensNeeded,
          balanceAfter: newBalance,
          description: `Reservation (${bookingMode === "own_spot" ? "own spot" : "full court"}): ${terrain.name} on ${start.toLocaleDateString()}`,
        });

        gear = await reserveEquipment(tx, {
          reservationId: reservation.id,
          userId: freshUser.id,
          start,
          end,
          items: equipmentReq,
        });

        await tx.insert(activityTable).values({
          type: "reservation_created",
          message: `Reservation created for ${terrain.name}`,
          userId: freshUser.id,
          userName:
            `${freshUser.firstName ?? ""} ${freshUser.lastName ?? ""}`.trim() || freshUser.email,
        });

        return reservation;
      } else {
        // Guest/admin manual booking (no token charge)
        const [reservation] = await tx
          .insert(reservationsTable)
          .values({
            terrainId: terrain.id,
            userId: null,
            guestName,
            guestPhone,
            startTime: start,
            endTime: end,
            status: "confirmed",
            tokensCharged: 0,
            bookingType: "manual" as any,
            bookingMode: bookingMode as any,
            totalSpots: 4,
            isPublic: false,
            notes,
          })
          .returning();

        await tx.insert(activityTable).values({
          type: "reservation_created",
          message: `Reservation created for ${terrain.name}`,
          userId: null,
          userName: guestName ?? "Guest",
        });
        gear = await reserveEquipment(tx, {
          reservationId: reservation.id,
          userId: null,
          start,
          end,
          items: equipmentReq,
        });

        return reservation;
      }
    });

    const full = await db.query.reservationsTable.findFirst({
      where: eq(reservationsTable.id, result.id),
      with: {
        terrain: true,
        user: true,
        players: { with: { user: true } },
        equipment: { with: { item: true } },
      },
    });
    if (targetUser) {
      const lang = (targetUser.language ?? "fr") as Lang;
      notifyLater(
        targetUser.id,
        {
          kind: "booking_confirmed",
          terrain: terrain.name,
          date: formatClubDate(start, lang),
          time: formatClubTime(start),
          tokens: tokensNeeded,
          mode: bookingMode === "own_spot" ? "own_spot" : "full_court",
          isPeak: price.isPeak,
          equipment: gear,
        },
        `booking:${result.id}`,
      );
    }
    res.status(201).json(full);
  } catch (err: any) {
    if (err instanceof EquipmentError) {
      res
        .status(409)
        .json({ error: `Not enough ${err.itemName} available (${err.available} left)` });
    } else if ((err.code ?? err.cause?.code) === "23505") {
      // unique index reservations_terrain_start_confirmed_idx: lost a race for the same slot
      res.status(409).json({ error: "Slot already booked" });
    } else if (err.message === "SLOT_CONFLICT") {
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
    with: {
      terrain: true,
      user: true,
      players: { with: { user: true } },
      equipment: { with: { item: true } },
    },
  });
  if (!reservation) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Allow creator, any joined player, or admin to view
  const isPlayer = reservation.players.some((p: any) => p.userId === user.id);
  if (user.role !== "admin" && reservation.userId !== user.id && !isPlayer) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(reservation);
});

router.patch("/reservations/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { status, notes } = req.body;
  const [updated] = await db
    .update(reservationsTable)
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
    with: { terrain: true, user: true, players: true },
  });
  if (!check) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Only creator or admin can cancel
  if (user.role !== "admin" && check.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const refunds: { userId: number; amount: number }[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      // Lock and transition status
      const [locked] = await tx
        .select()
        .from(reservationsTable)
        .where(and(eq(reservationsTable.id, id), eq(reservationsTable.status, "confirmed" as any)))
        .for("update");

      if (!locked) {
        throw new Error("ALREADY_CANCELLED");
      }

      const [updated] = await tx
        .update(reservationsTable)
        .set({ status: "cancelled" })
        .where(eq(reservationsTable.id, id))
        .returning();

      // Refund ALL players who paid tokens (player-row-driven accounting)
      const paidPlayers = await tx
        .select()
        .from(reservationPlayersTable)
        .where(
          and(
            eq(reservationPlayersTable.reservationId, id),
            eq(reservationPlayersTable.paymentStatus, "paid"),
            eq(reservationPlayersTable.paymentType, "token"),
          ),
        )
        .for("update");

      if (paidPlayers.length > 0) {
        // Refund each player who paid
        for (const playerRow of paidPlayers) {
          if (!playerRow.userId || playerRow.tokensCharged <= 0) continue;
          const [targetUser] = await tx
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, playerRow.userId))
            .for("update");
          if (!targetUser) continue;

          const newBalance = targetUser.tokenBalance + playerRow.tokensCharged;
          await tx
            .update(usersTable)
            .set({ tokenBalance: newBalance })
            .where(eq(usersTable.id, targetUser.id));
          await tx
            .update(reservationPlayersTable)
            .set({ paymentStatus: "refunded" as any })
            .where(eq(reservationPlayersTable.id, playerRow.id));
          await tx.insert(tokenTransactionsTable).values({
            userId: targetUser.id,
            reservationId: id,
            type: "credit",
            amount: playerRow.tokensCharged,
            balanceAfter: newBalance,
            description: `Cancellation refund: ${check.terrain?.name ?? "terrain"}`,
          });
          refunds.push({ userId: targetUser.id, amount: playerRow.tokensCharged });
        }
      } else if (locked.userId && locked.tokensCharged > 0) {
        // Legacy reservation without player rows — fall back to reservation-level refund
        const [targetUser] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, locked.userId))
          .for("update");
        if (targetUser) {
          const newBalance = targetUser.tokenBalance + locked.tokensCharged;
          await tx
            .update(usersTable)
            .set({ tokenBalance: newBalance })
            .where(eq(usersTable.id, targetUser.id));
          await tx.insert(tokenTransactionsTable).values({
            userId: targetUser.id,
            reservationId: id,
            type: "credit",
            amount: locked.tokensCharged,
            balanceAfter: newBalance,
            description: `Cancellation refund: ${check.terrain?.name ?? "terrain"}`,
          });
          refunds.push({ userId: targetUser.id, amount: locked.tokensCharged });
        }
      }

      await tx
        .update(reservationEquipmentTable)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(reservationEquipmentTable.reservationId, id),
            eq(reservationEquipmentTable.status, "reserved" as any),
          ),
        );

      return {
        updated,
        userName: check.user
          ? `${check.user.firstName ?? ""} ${check.user.lastName ?? ""}`.trim() || check.user.email
          : null,
      };
    });

    await db.insert(activityTable).values({
      type: "reservation_cancelled",
      message: `Reservation cancelled for ${check.terrain?.name ?? "terrain"}`,
      userId: check.userId,
      userName: result.userName,
    });

    // Everyone in the match hears about it, refunded or not
    const recipients = new Map<number, number>();
    for (const p of check.players) if (p.userId) recipients.set(p.userId, 0);
    if (check.userId) recipients.set(check.userId, recipients.get(check.userId) ?? 0);
    for (const r of refunds) recipients.set(r.userId, (recipients.get(r.userId) ?? 0) + r.amount);
    for (const [userId, refunded] of recipients) {
      const u = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
      if (!u) continue;
      const lang = (u.language ?? "fr") as Lang;
      notifyLater(
        u,
        {
          kind: "booking_cancelled",
          terrain: check.terrain?.name ?? "",
          date: formatClubDate(check.startTime, lang),
          time: formatClubTime(check.startTime),
          refunded,
        },
        `cancel:${id}`,
      );
    }

    res.json(result.updated);
  } catch (err: any) {
    if (err.message === "ALREADY_CANCELLED") {
      res.status(400).json({ error: "Already cancelled" });
    } else {
      throw err;
    }
  }
});

// ─── Add rental equipment to an existing booking ─────────────────────────────
router.post("/reservations/:id/equipment", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const user = (req as any).dbUser;
  const items = normalizeRequest(req.body?.items);
  if (!items.length) {
    res.status(400).json({ error: "No equipment selected" });
    return;
  }
  const r = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { players: true },
  });
  if (!r || r.status !== "confirmed") {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  const inMatch = r.userId === user.id || r.players.some((p: any) => p.userId === user.id);
  if (!inMatch && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (r.startTime <= new Date()) {
    res.status(400).json({ error: "This match has already started" });
    return;
  }
  try {
    const lines = await db.transaction((tx) =>
      reserveEquipment(tx, {
        reservationId: id,
        userId: inMatch ? user.id : r.userId,
        start: r.startTime,
        end: r.endTime,
        items,
      }),
    );
    res.status(201).json({ items: lines });
  } catch (err: any) {
    if (err instanceof EquipmentError)
      res
        .status(409)
        .json({ error: `Not enough ${err.itemName} available (${err.available} left)` });
    else throw err;
  }
});

export default router;
