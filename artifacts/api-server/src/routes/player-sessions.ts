import { Router } from "express";
import { db, reservationsTable, reservationPlayersTable, playerInvitesTable, usersTable, tokenTransactionsTable, notificationsTable, activityTable, terrainsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireUser, requireAdmin } from "../lib/auth";
import crypto from "node:crypto";

const router = Router();

// ─── Join a session (book own spot) ──────────────────────────────────────────
router.post("/reservations/:id/join", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const currentUser = (req as any).dbUser;

  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { terrain: true, players: true },
  });
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  if (reservation.status !== "confirmed") {
    res.status(400).json({ error: "Reservation is not active" });
    return;
  }
  if (reservation.bookingMode === "full_court") {
    res.status(400).json({ error: "This court is fully reserved — no open spots" });
    return;
  }

  if (reservation.startTime <= new Date()) {
    res.status(400).json({ error: "Cannot join a session that has already started or ended" });
    return;
  }

  const alreadyJoined = reservation.players.find(p => p.userId === currentUser.id);
  if (alreadyJoined) {
    res.status(409).json({ error: "You already have a spot in this session" });
    return;
  }

  const tokensNeeded = 1;

  try {
    await db.transaction(async (tx) => {
      const [freshUser] = await tx.select().from(usersTable)
        .where(eq(usersTable.id, currentUser.id)).for("update");
      if (!freshUser || freshUser.tokenBalance < tokensNeeded) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      // Re-check capacity inside transaction
      const [{ c }] = await tx.select({ c: count() }).from(reservationPlayersTable)
        .where(eq(reservationPlayersTable.reservationId, id));
      const currentFilled = Number(c);
      if (currentFilled >= (reservation.totalSpots ?? 4)) {
        throw new Error("NO_SPOTS");
      }

      const newBalance = freshUser.tokenBalance - tokensNeeded;
      await tx.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, freshUser.id));

      await tx.insert(reservationPlayersTable).values({
        reservationId: id,
        userId: currentUser.id,
        paymentType: "token",
        paymentStatus: "paid",
        tokensCharged: tokensNeeded,
      });

      await tx.insert(tokenTransactionsTable).values({
        userId: freshUser.id,
        reservationId: id,
        type: "debit",
        amount: tokensNeeded,
        balanceAfter: newBalance,
        description: `Joined session: ${reservation.terrain?.name ?? "court"} on ${reservation.startTime.toLocaleDateString()}`,
      });

      await tx.insert(notificationsTable).values({
        userId: freshUser.id,
        type: "booking_confirmed",
        title: "Spot Confirmed",
        message: `You joined a session on ${reservation.terrain?.name} at ${reservation.startTime.toLocaleTimeString()}.`,
      });
    });

    res.status(201).json({ message: "Spot joined successfully" });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_TOKENS") {
      res.status(400).json({ error: "Insufficient tokens" });
    } else if (err.message === "NO_SPOTS") {
      res.status(409).json({ error: "No open spots left in this session" });
    } else {
      throw err;
    }
  }
});

// ─── Leave a session ──────────────────────────────────────────────────────────
router.delete("/reservations/:id/leave", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const currentUser = (req as any).dbUser;

  const playerRow = await db.query.reservationPlayersTable.findFirst({
    where: and(
      eq(reservationPlayersTable.reservationId, id),
      eq(reservationPlayersTable.userId, currentUser.id),
    ),
    with: { reservation: { with: { terrain: true } } },
  });

  if (!playerRow) {
    res.status(404).json({ error: "You are not in this session" });
    return;
  }

  const reservation = playerRow.reservation;

  // Creator of an explicit full_court booking cannot "leave" — they must cancel the reservation
  const isCreator = reservation.userId === currentUser.id;
  const isFullCourt = reservation.bookingMode === "full_court";
  if (isCreator && isFullCourt) {
    res.status(400).json({ error: "Court creator cannot leave — please cancel the reservation instead" });
    return;
  }

  const now = new Date();
  if (reservation.startTime <= now) {
    res.status(400).json({ error: "Cannot leave a session that has already started" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(reservationPlayersTable)
      .where(eq(reservationPlayersTable.id, playerRow.id));

    if (playerRow.paymentStatus === "paid" && playerRow.paymentType === "token" && playerRow.tokensCharged > 0) {
      const [freshUser] = await tx.select().from(usersTable)
        .where(eq(usersTable.id, currentUser.id)).for("update");
      if (freshUser) {
        const newBalance = freshUser.tokenBalance + playerRow.tokensCharged;
        await tx.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, freshUser.id));
        await tx.insert(tokenTransactionsTable).values({
          userId: freshUser.id,
          reservationId: id,
          type: "credit",
          amount: playerRow.tokensCharged,
          balanceAfter: newBalance,
          description: `Left session: ${reservation.terrain?.name ?? "court"}`,
        });
        await tx.insert(notificationsTable).values({
          userId: freshUser.id,
          type: "booking_cancelled",
          title: "Spot Released",
          message: `You left the session. ${playerRow.tokensCharged} token(s) refunded.`,
        });
      }
    }
  });

  res.json({ message: "Left session successfully" });
});

// ─── Generate invite link ─────────────────────────────────────────────────────
router.post("/reservations/:id/invite", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const currentUser = (req as any).dbUser;
  const { email } = req.body;

  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { players: true },
  });

  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  // Must be creator or a player in the session or admin
  const isCreator = reservation.userId === currentUser.id;
  const isPlayer = reservation.players.some(p => p.userId === currentUser.id);
  if (!isCreator && !isPlayer && currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (reservation.status !== "confirmed") {
    res.status(400).json({ error: "Reservation is not active" });
    return;
  }

  // Full-court sessions are fully reserved — invites don't apply
  if (reservation.bookingMode === "full_court") {
    res.status(400).json({ error: "Full-court reservations cannot have additional players" });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(reservation.startTime.getTime() - 30 * 60 * 1000); // 30 min before session

  const [invite] = await db.insert(playerInvitesTable).values({
    inviteToken: token,
    reservationId: id,
    invitedByUserId: currentUser.id,
    invitedEmail: email || null,
    expiresAt,
    status: "pending",
  }).returning();

  const inviteUrl = `${process.env.FRONTEND_URL ?? ""}/join/${invite.inviteToken}`;

  res.status(201).json({ invite, inviteUrl, token: invite.inviteToken });
});

// ─── Resolve invite ───────────────────────────────────────────────────────────
router.get("/invites/:token", async (req, res) => {
  const { token } = req.params as { token: string };

  const invite = await db.query.playerInvitesTable.findFirst({
    where: eq(playerInvitesTable.inviteToken, token),
    with: {
      reservation: { with: { terrain: true, players: { with: { user: true } } } },
      invitedBy: true,
    },
  });

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  if (invite.status !== "pending") {
    res.status(410).json({ error: `Invite is ${invite.status}` });
    return;
  }

  if (invite.expiresAt < new Date()) {
    await db.update(playerInvitesTable)
      .set({ status: "expired" })
      .where(eq(playerInvitesTable.id, invite.id));
    res.status(410).json({ error: "Invite has expired" });
    return;
  }

  const filledSpots = invite.reservation.players.length;
  const openSpots = Math.max(0, (invite.reservation.totalSpots ?? 4) - filledSpots);

  res.json({
    invite: {
      id: invite.id,
      status: invite.status,
      expiresAt: invite.expiresAt,
      invitedBy: invite.invitedBy
        ? `${invite.invitedBy.firstName ?? ""} ${invite.invitedBy.lastName ?? ""}`.trim() || invite.invitedBy.email
        : "Someone",
    },
    reservation: {
      id: invite.reservation.id,
      terrainName: invite.reservation.terrain?.name,
      startTime: invite.reservation.startTime,
      endTime: invite.reservation.endTime,
      totalSpots: invite.reservation.totalSpots ?? 4,
      filledSpots,
      openSpots,
    },
  });
});

// ─── Accept invite ────────────────────────────────────────────────────────────
router.post("/invites/:token/accept", requireUser, async (req, res) => {
  const { token } = req.params as { token: string };
  const currentUser = (req as any).dbUser;

  const invite = await db.query.playerInvitesTable.findFirst({
    where: eq(playerInvitesTable.inviteToken, token),
    with: { reservation: { with: { terrain: true } } },
  });

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  if (invite.status !== "pending") {
    res.status(410).json({ error: `Invite is ${invite.status}` });
    return;
  }
  if (invite.expiresAt < new Date()) {
    await db.update(playerInvitesTable).set({ status: "expired" }).where(eq(playerInvitesTable.id, invite.id));
    res.status(410).json({ error: "Invite has expired" });
    return;
  }
  if (invite.reservation.status !== "confirmed") {
    res.status(400).json({ error: "This session is no longer active" });
    return;
  }

  // Block joining a full-court session via invite
  if (invite.reservation.bookingMode === "full_court") {
    res.status(400).json({ error: "Full-court reservations cannot have additional players" });
    return;
  }

  if (invite.reservation.startTime <= new Date()) {
    res.status(400).json({ error: "Cannot join a session that has already started or ended" });
    return;
  }

  const tokensNeeded = 1;

  try {
    await db.transaction(async (tx) => {
      // Lock user row and check tokens
      const [freshUser] = await tx.select().from(usersTable)
        .where(eq(usersTable.id, currentUser.id)).for("update");
      if (!freshUser || freshUser.tokenBalance < tokensNeeded) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      // Transactional capacity re-check (prevents concurrent overbooking)
      const [{ c: existingCount }] = await tx.select({ c: count() })
        .from(reservationPlayersTable)
        .where(eq(reservationPlayersTable.reservationId, invite.reservation.id));
      if (Number(existingCount) >= (invite.reservation.totalSpots ?? 4)) {
        throw new Error("NO_SPOTS");
      }

      // Check not already joined
      const [alreadyIn] = await tx.select().from(reservationPlayersTable)
        .where(and(
          eq(reservationPlayersTable.reservationId, invite.reservation.id),
          eq(reservationPlayersTable.userId, currentUser.id),
        ));
      if (alreadyIn) {
        throw new Error("ALREADY_JOINED");
      }

      const newBalance = freshUser.tokenBalance - tokensNeeded;
      await tx.update(usersTable).set({ tokenBalance: newBalance }).where(eq(usersTable.id, freshUser.id));

      await tx.insert(reservationPlayersTable).values({
        reservationId: invite.reservation.id,
        userId: currentUser.id,
        paymentType: "token",
        paymentStatus: "paid",
        tokensCharged: tokensNeeded,
      });

      await tx.update(playerInvitesTable)
        .set({ status: "accepted" })
        .where(eq(playerInvitesTable.id, invite.id));

      await tx.insert(tokenTransactionsTable).values({
        userId: freshUser.id,
        reservationId: invite.reservation.id,
        type: "debit",
        amount: tokensNeeded,
        balanceAfter: newBalance,
        description: `Joined via invite: ${invite.reservation.terrain?.name ?? "court"}`,
      });

      await tx.insert(notificationsTable).values({
        userId: freshUser.id,
        type: "booking_confirmed",
        title: "Spot Confirmed",
        message: `You joined a session on ${invite.reservation.terrain?.name} via invite.`,
      });
    });

    res.status(201).json({ message: "Joined session via invite" });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_TOKENS") {
      res.status(400).json({ error: "Insufficient tokens" });
    } else if (err.message === "NO_SPOTS") {
      res.status(409).json({ error: "No open spots left in this session" });
    } else if (err.message === "ALREADY_JOINED") {
      res.status(409).json({ error: "You already have a spot in this session" });
    } else {
      throw err;
    }
  }
});

// ─── Admin: Update player payment status ─────────────────────────────────────
router.patch("/reservations/:id/players/:playerId", requireAdmin, async (req, res) => {
  const reservationId = parseInt(req.params.id as string);
  const playerId = parseInt(req.params.playerId as string);
  const { paymentStatus, paymentType } = req.body;

  const updates: Record<string, any> = {};
  if (paymentStatus) updates.paymentStatus = paymentStatus;
  if (paymentType) updates.paymentType = paymentType;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [updated] = await db.update(reservationPlayersTable)
    .set(updates)
    .where(and(
      eq(reservationPlayersTable.id, playerId),
      eq(reservationPlayersTable.reservationId, reservationId),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Player not found in this reservation" });
    return;
  }

  res.json(updated);
});

// ─── Open matches (public sessions with open spots) ───────────────────────────
router.get("/open-matches", async (req, res) => {
  const now = new Date();

  const sessions = await db.query.reservationsTable.findMany({
    where: and(
      eq(reservationsTable.status, "confirmed" as any),
      eq(reservationsTable.isPublic, true),
      eq(reservationsTable.bookingMode, "own_spot" as any),
    ),
    with: {
      terrain: true,
      players: { with: { user: true } },
      user: true,
    },
    orderBy: [reservationsTable.startTime],
    limit: 50,
  });

  const openMatches = sessions
    .filter(s => s.startTime > now)
    .map(s => {
      const filledSpots = s.players.length;
      const openSpots = Math.max(0, (s.totalSpots ?? 4) - filledSpots);
      return {
        reservationId: s.id,
        terrain: s.terrain,
        startTime: s.startTime,
        endTime: s.endTime,
        totalSpots: s.totalSpots ?? 4,
        filledSpots,
        openSpots,
        publicDescription: s.publicDescription,
        // Public-safe: names only, no payment details
        players: s.players.map(p => ({
          name: p.user
            ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || "Player"
            : "Player",
        })),
      };
    })
    .filter(m => m.openSpots > 0);

  res.json(openMatches);
});

// ─── Make session public / private ───────────────────────────────────────────
router.post("/reservations/:id/open-match", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const currentUser = (req as any).dbUser;
  const { publicDescription } = req.body;

  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { players: true },
  });

  if (!reservation) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isCreator = reservation.userId === currentUser.id;
  const isPlayer = reservation.players.some(p => p.userId === currentUser.id);
  if (!isCreator && !isPlayer && currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (reservation.bookingMode !== "own_spot") {
    res.status(400).json({ error: "Only own-spot sessions can be made public" });
    return;
  }

  const [updated] = await db.update(reservationsTable)
    .set({ isPublic: true, publicDescription: publicDescription || null })
    .where(eq(reservationsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/reservations/:id/open-match", requireUser, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const currentUser = (req as any).dbUser;

  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { players: true },
  });

  if (!reservation) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isCreator = reservation.userId === currentUser.id;
  const isPlayer = reservation.players.some(p => p.userId === currentUser.id);
  if (!isCreator && !isPlayer && currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db.update(reservationsTable)
    .set({ isPublic: false })
    .where(eq(reservationsTable.id, id))
    .returning();

  res.json(updated);
});

// ─── Admin: Assign player to a session ───────────────────────────────────────
router.post("/reservations/:id/players", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { userId, paymentType = "cash", paymentStatus = "pending" } = req.body;

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [reservation] = await db.select().from(reservationsTable)
    .where(eq(reservationsTable.id, id));
  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  if (reservation.status !== "confirmed") {
    res.status(400).json({ error: "Reservation is not active" });
    return;
  }

  // Full-court sessions are entirely reserved — cannot add individual players
  if (reservation.bookingMode === "full_court") {
    res.status(400).json({ error: "Full-court reservations cannot have additional players" });
    return;
  }

  // Check capacity
  const [{ c }] = await db.select({ c: count() }).from(reservationPlayersTable)
    .where(eq(reservationPlayersTable.reservationId, id));
  if (Number(c) >= (reservation.totalSpots ?? 4)) {
    res.status(409).json({ error: "No open spots left in this session" });
    return;
  }

  // Check not already a player
  const [existing] = await db.select().from(reservationPlayersTable)
    .where(and(eq(reservationPlayersTable.reservationId, id), eq(reservationPlayersTable.userId, parseInt(userId))));
  if (existing) {
    res.status(409).json({ error: "Player already in this session" });
    return;
  }

  const [player] = await db.insert(reservationPlayersTable).values({
    reservationId: id,
    userId: parseInt(userId),
    paymentType: paymentType as any,
    paymentStatus: paymentStatus as any,
    tokensCharged: 0,
  }).returning();

  res.status(201).json(player);
});

// ─── Admin: Block a slot for maintenance ─────────────────────────────────────
router.post("/admin/slots/block", requireAdmin, async (req, res) => {
  const { terrainId, startTime, reason = "Maintenance" } = req.body;

  if (!terrainId || !startTime) {
    res.status(400).json({ error: "terrainId and startTime are required" });
    return;
  }

  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, parseInt(terrainId)));
  if (!terrain) {
    res.status(404).json({ error: "Terrain not found" });
    return;
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  // Check for existing confirmed reservation at this slot
  const [conflict] = await db.select().from(reservationsTable).where(
    and(
      eq(reservationsTable.terrainId, terrain.id),
      eq(reservationsTable.status, "confirmed" as any),
      eq(reservationsTable.startTime, start),
    )
  );
  if (conflict) {
    res.status(409).json({ error: "Slot already has a confirmed reservation" });
    return;
  }

  const [blocked] = await db.insert(reservationsTable).values({
    terrainId: terrain.id,
    userId: null,
    guestName: `[${reason}]`,
    startTime: start,
    endTime: end,
    status: "confirmed",
    tokensCharged: 0,
    bookingType: "manual",
    bookingMode: "full_court",
    totalSpots: 4,
    isPublic: false,
    notes: reason,
  }).returning();

  res.status(201).json(blocked);
});

export default router;

