import { Router } from "express";
import { db, reservationsTable, reservationPlayersTable, playerInvitesTable, usersTable, tokenTransactionsTable, notificationsTable, activityTable } from "@workspace/db";
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

  const alreadyJoined = reservation.players.find(p => p.userId === currentUser.id);
  if (alreadyJoined) {
    res.status(409).json({ error: "You already have a spot in this session" });
    return;
  }

  const filledSpots = reservation.players.length > 0 ? reservation.players.length : 1;
  if (filledSpots >= reservation.totalSpots) {
    res.status(409).json({ error: "No open spots left in this session" });
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
      const currentFilled = Number(c) > 0 ? Number(c) : 1; // session creator counts as 1
      if (currentFilled >= reservation.totalSpots) {
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

  const now = new Date();
  if (playerRow.reservation.startTime <= now) {
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
          description: `Left session: ${playerRow.reservation.terrain?.name ?? "court"}`,
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

  const filledSpots = invite.reservation.players.length > 0 ? invite.reservation.players.length : 1;
  const openSpots = Math.max(0, invite.reservation.totalSpots - filledSpots);

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
      totalSpots: invite.reservation.totalSpots,
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
    with: { reservation: { with: { terrain: true, players: true } } },
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

  const alreadyJoined = invite.reservation.players.find(p => p.userId === currentUser.id);
  if (alreadyJoined) {
    res.status(409).json({ error: "You already have a spot in this session" });
    return;
  }

  const filledSpots = invite.reservation.players.length > 0 ? invite.reservation.players.length : 1;
  if (filledSpots >= invite.reservation.totalSpots) {
    res.status(409).json({ error: "No open spots left in this session" });
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
    } else {
      throw err;
    }
  }
});

// ─── Admin: Update player payment status ─────────────────────────────────────
router.patch("/reservations/:id/players/:playerId", requireAdmin, async (req, res) => {
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
    .where(eq(reservationPlayersTable.id, playerId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(updated);
});

// ─── Open matches (public sessions) ──────────────────────────────────────────
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
      const filledSpots = s.players.length > 0 ? s.players.length : 1;
      const openSpots = Math.max(0, s.totalSpots - filledSpots);
      return {
        reservationId: s.id,
        terrain: s.terrain,
        startTime: s.startTime,
        endTime: s.endTime,
        totalSpots: s.totalSpots,
        filledSpots,
        openSpots,
        publicDescription: s.publicDescription,
        players: s.players.map(p => ({
          name: p.user ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || "Player" : "Player",
          paymentStatus: p.paymentStatus,
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

export default router;
