import { Router, type Request } from "express";
import {
  db,
  reservationsTable,
  reservationPlayersTable,
  playerInvitesTable,
  usersTable,
  terrainsTable,
  activityTable,
  reservationEquipmentTable,
} from "@workspace/db";
import { eq, and, asc, desc, gt, ilike, ne, or, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { requireUser, requireAdmin } from "../lib/auth";
import { loadActiveRules, priceFor, quote } from "../lib/pricing";
import { notifyLater } from "../lib/notify";
import { clubParts, formatClubDate, formatClubTime, type Lang } from "../lib/club-time";
import { normalizeRequest, reserveEquipment } from "../lib/equipment";
import { moveTokens, type Tx } from "../lib/ledger";
import { assertBookable } from "../lib/slots";
import { getSettings, scheduleContext, type ClubSettings } from "../lib/settings";
import { HttpError, cleanText, oneOf, pgCode, pgHint, requireId } from "../lib/http";
import { bookingConflict, lateCancellation } from "./reservations";
import { env } from "../config/env";

const router = Router();
type DbUser = typeof usersTable.$inferSelect;
const me = (req: Request) => (req as any).dbUser as DbUser;

/** Public-safe name: "Yasmine B.", never an email address. */
const publicName = (u?: { firstName?: string | null; lastName?: string | null } | null) => {
  const first = (u?.firstName ?? "").trim(),
    initial = (u?.lastName ?? "").trim().charAt(0);
  return first ? `${first}${initial ? ` ${initial}.` : ""}` : "Player";
};

type PayMethod = "token" | "cash_club";

const featureOff = (what: string) =>
  new HttpError(403, `${what} are disabled at this club`, "FEATURE_DISABLED");

/** Payment a player picked. "Pay at the club" only when the club allows it. */
function playerMethod(value: unknown, settings: ClubSettings): PayMethod {
  const method = oneOf(value, ["token", "cash_club"] as const) ?? "token";
  if (method === "cash_club" && !settings.cashPaymentEnabled)
    throw new HttpError(400, "Paying at the club is not available: use tokens", "CASH_DISABLED");
  return method;
}

/** Maps a failed player insert to a clear answer. */
function joinConflict(err: unknown): never {
  if (pgHint(err) === "RESERVATION_FULL")
    throw new HttpError(409, "No open spots left in this match", "MATCH_FULL");
  if (pgCode(err) === "23505")
    throw new HttpError(409, "You already have a spot in this match", "ALREADY_JOINED");
  return bookingConflict(err);
}

/**
 * Adds a member to a match inside a transaction.
 *  - full_court booking  → invited_free (the booker already paid the 4 spots)
 *  - own_spot + token    → debits the slot's spot price
 *  - own_spot + cash     → spot held, cash_club / pending until paid at the desk
 */
async function addPlayer(
  tx: Tx,
  r: { id: number; bookingMode: "full_court" | "own_spot"; terrainName: string; startTime: Date },
  userId: number,
  method: PayMethod,
  tokensPerSpot: number,
  opts: { adminId?: number | null; cashPaid?: boolean; viaInvite?: boolean } = {},
) {
  // Lock the reservation: concurrent joins are serialized (the DB trigger also caps at 4)
  const [locked] = await tx
    .select({ status: reservationsTable.status })
    .from(reservationsTable)
    .where(eq(reservationsTable.id, r.id))
    .for("update");
  if (!locked || locked.status !== "confirmed")
    throw new HttpError(400, "This match is no longer active", "MATCH_INACTIVE");

  const free = r.bookingMode === "full_court";
  const [row] = await tx
    .insert(reservationPlayersTable)
    .values({
      reservationId: r.id,
      userId,
      paymentType: free ? "invited_free" : method,
      paymentStatus: free || method === "token" || opts.cashPaid ? "paid" : "pending",
      tokensCharged: !free && method === "token" ? tokensPerSpot : 0,
    })
    .returning();

  if (!free && method === "token") {
    await moveTokens(tx, {
      userId,
      delta: -tokensPerSpot,
      type: "debit",
      reservationId: r.id,
      adminId: opts.adminId ?? null,
      description: `${opts.viaInvite ? "Joined via invite" : "Joined match"} · ${r.terrainName} · ${formatClubDate(r.startTime)} ${formatClubTime(r.startTime)}`,
    });
  }
  return row;
}

async function loadMatch(id: number) {
  const r = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { terrain: true, players: true },
  });
  if (!r) throw new HttpError(404, "Match not found", "NOT_FOUND");
  return r;
}

function assertJoinable(r: Awaited<ReturnType<typeof loadMatch>>) {
  if (r.status !== "confirmed")
    throw new HttpError(400, "This match is no longer active", "MATCH_INACTIVE");
  if (r.startTime <= new Date())
    throw new HttpError(400, "This match has already started", "MATCH_STARTED");
  if (r.players.length >= r.totalSpots)
    throw new HttpError(409, "No open spots left in this match", "MATCH_FULL");
}

// ─── Join an open spot (own_spot matches) ────────────────────────────────────
router.post("/reservations/:id/join", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = me(req);
  const settings = await getSettings();
  if (!settings.openMatchesEnabled) throw featureOff("Open matches");
  const method = playerMethod(req.body?.paymentMethod, settings);
  const r = await loadMatch(id);
  assertJoinable(r);
  if (r.bookingMode === "full_court")
    throw new HttpError(
      400,
      "This court is privately booked. Ask the booker for an invite link.",
      "PRIVATE_MATCH",
    );
  if (r.players.some((p) => p.userId === user.id))
    throw new HttpError(409, "You already have a spot in this match", "ALREADY_JOINED");

  const price = await quote(r.terrain!, r.startTime);
  const equipmentReq = normalizeRequest(req.body?.equipment);
  let gear: { name: string; quantity: number; price: number }[] = [];
  try {
    gear = await db.transaction(async (tx: Tx) => {
      await addPlayer(
        tx,
        {
          id,
          bookingMode: r.bookingMode,
          terrainName: r.terrain?.name ?? "court",
          startTime: r.startTime,
        },
        user.id,
        method,
        price.tokensPerSpot,
      );
      return reserveEquipment(tx, {
        reservationId: id,
        userId: user.id,
        start: r.startTime,
        end: r.endTime,
        items: equipmentReq,
      });
    });
  } catch (err) {
    joinConflict(err);
  }

  const tokens = method === "token" ? price.tokensPerSpot : 0;
  notifyLater(
    user,
    {
      kind: "booking_confirmed",
      terrain: r.terrain?.name ?? "",
      date: formatClubDate(r.startTime, (user.language ?? "fr") as Lang),
      time: formatClubTime(r.startTime),
      tokens,
      mode: "joined",
      isPeak: price.isPeak,
      equipment: gear,
    },
    `join:${id}:${Date.now()}`,
  );
  res.status(201).json({ message: "Spot joined", tokensCharged: tokens, paymentType: method });
});

// ─── Leave a match ───────────────────────────────────────────────────────────
router.delete("/reservations/:id/leave", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = me(req);
  const r = await loadMatch(id);
  const mine = r.players.find((p) => p.userId === user.id);
  if (!mine) throw new HttpError(404, "You are not in this match", "NOT_IN_MATCH");
  if (r.status !== "confirmed")
    throw new HttpError(400, "This match is no longer active", "MATCH_INACTIVE");
  if (r.userId === user.id && r.bookingMode === "full_court")
    throw new HttpError(
      400,
      "You booked the whole court: cancel the booking instead",
      "USE_CANCEL",
    );
  if (r.startTime <= new Date())
    throw new HttpError(400, "This match has already started", "MATCH_STARTED");
  // Same deadline as a cancellation; a late 'no_refund' leave keeps the spot's tokens
  const forfeit = lateCancellation(await getSettings(), r.startTime);

  const result = await db.transaction(async (tx: Tx) => {
    await tx
      .select({ id: reservationsTable.id })
      .from(reservationsTable)
      .where(eq(reservationsTable.id, id))
      .for("update");
    const [row] = await tx
      .delete(reservationPlayersTable)
      .where(
        and(
          eq(reservationPlayersTable.reservationId, id),
          eq(reservationPlayersTable.userId, user.id),
        ),
      )
      .returning();
    if (!row) throw new HttpError(404, "You are not in this match", "NOT_IN_MATCH");

    let refunded = 0;
    if (
      !forfeit &&
      row.paymentType === "token" &&
      row.paymentStatus === "paid" &&
      row.tokensCharged > 0
    ) {
      await moveTokens(tx, {
        userId: user.id,
        delta: row.tokensCharged,
        type: "credit",
        reservationId: id,
        description: `Refund · left match · ${r.terrain?.name ?? "court"}`,
      });
      refunded = row.tokensCharged;
    }
    await tx
      .update(reservationEquipmentTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(reservationEquipmentTable.reservationId, id),
          eq(reservationEquipmentTable.userId, user.id),
          eq(reservationEquipmentTable.status, "reserved"),
        ),
      );

    // An own-spot match left empty frees the court; otherwise the next player
    // becomes the organiser so somebody can still invite or cancel.
    const remaining = await tx
      .select()
      .from(reservationPlayersTable)
      .where(eq(reservationPlayersTable.reservationId, id))
      .orderBy(asc(reservationPlayersTable.joinedAt));
    let freed = false;
    if (remaining.length === 0) {
      await tx
        .update(reservationsTable)
        .set({ status: "cancelled" })
        .where(eq(reservationsTable.id, id));
      freed = true;
    } else if (r.userId === user.id) {
      await tx
        .update(reservationsTable)
        .set({ userId: remaining[0].userId })
        .where(eq(reservationsTable.id, id));
    }
    return { refunded, freed, refundForfeited: forfeit && row.tokensCharged > 0 };
  });

  notifyLater(
    user,
    {
      kind: "booking_cancelled",
      terrain: r.terrain?.name ?? "",
      date: formatClubDate(r.startTime, (user.language ?? "fr") as Lang),
      time: formatClubTime(r.startTime),
      refunded: result.refunded,
    },
    `leave:${id}:${Date.now()}`,
  );
  res.json({ message: "Left the match", ...result });
});

// ─── Invitations ─────────────────────────────────────────────────────────────
// Without userId: one shareable link (and QR code) per match and inviter, usable by
// anyone until the match is full. With userId: a personal in-app invitation that
// this member accepts or declines (and is notified about).
router.post("/reservations/:id/invite", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = me(req);
  const settings = await getSettings();
  if (!settings.invitationsEnabled) throw featureOff("Invitations");
  const r = await loadMatch(id);
  const isCreator = r.userId === user.id;
  const isPlayer = r.players.some((p) => p.userId === user.id);
  // Full court: the booker paid for the spots, so only they (or staff) hand them out.
  const allowed = user.role === "admin" || isCreator || (r.bookingMode === "own_spot" && isPlayer);
  if (!allowed) throw new HttpError(403, "Only the booker can invite to this court", "FORBIDDEN");
  if (r.status !== "confirmed")
    throw new HttpError(400, "This match is no longer active", "MATCH_INACTIVE");
  if (r.startTime <= new Date())
    throw new HttpError(400, "This match has already started", "MATCH_STARTED");

  const base = (env.frontendUrl ?? "").replace(/\/$/, "");
  const free = r.bookingMode === "full_court";

  if (req.body?.userId !== undefined && req.body?.userId !== null) {
    const invitedUserId = requireId(req.body.userId, "member");
    if (invitedUserId === user.id)
      throw new HttpError(400, "You are already in this match", "ALREADY_JOINED");
    if (r.players.some((p) => p.userId === invitedUserId))
      throw new HttpError(409, "This member is already in the match", "ALREADY_JOINED");
    if (r.players.length >= r.totalSpots)
      throw new HttpError(409, "No open spots left in this match", "MATCH_FULL");
    const [guest] = await db.select().from(usersTable).where(eq(usersTable.id, invitedUserId));
    if (!guest) throw new HttpError(404, "Member not found", "USER_NOT_FOUND");
    let invite;
    try {
      [invite] = await db
        .insert(playerInvitesTable)
        .values({
          inviteToken: crypto.randomBytes(18).toString("base64url"),
          reservationId: id,
          invitedByUserId: user.id,
          invitedUserId,
          expiresAt: r.startTime,
          status: "pending",
        })
        .returning();
    } catch (err) {
      if (pgCode(err) === "23505")
        throw new HttpError(409, "This member already has a pending invitation", "ALREADY_INVITED");
      throw err;
    }
    const lang = (guest.language ?? "fr") as Lang;
    notifyLater(
      guest,
      {
        kind: "invitation",
        from: publicName(user),
        terrain: r.terrain?.name ?? "",
        date: formatClubDate(r.startTime, lang),
        time: formatClubTime(r.startTime),
        free,
        token: invite.inviteToken,
      },
      `invite:${invite.id}`,
    );
    res.status(201).json({
      invite,
      token: invite.inviteToken,
      inviteUrl: `${base}/join/${invite.inviteToken}`,
      free,
      invitedUser: { id: guest.id, name: publicName(guest) },
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(playerInvitesTable)
    .where(
      and(
        eq(playerInvitesTable.reservationId, id),
        eq(playerInvitesTable.invitedByUserId, user.id),
        eq(playerInvitesTable.status, "pending"),
        gt(playerInvitesTable.expiresAt, new Date()),
        sql`${playerInvitesTable.invitedUserId} is null`,
      ),
    )
    .limit(1);
  const invite =
    existing ??
    (
      await db
        .insert(playerInvitesTable)
        .values({
          inviteToken: crypto.randomBytes(18).toString("base64url"),
          reservationId: id,
          invitedByUserId: user.id,
          invitedEmail: cleanText(req.body?.email, 254),
          // Usable until kickoff
          expiresAt: r.startTime,
          status: "pending",
        })
        .returning()
    )[0];

  res.status(201).json({
    invite,
    token: invite.inviteToken,
    inviteUrl: `${base}/join/${invite.inviteToken}`,
    free,
  });
});

async function loadInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token))
    throw new HttpError(404, "Invite not found", "NOT_FOUND");
  const invite = await db.query.playerInvitesTable.findFirst({
    where: eq(playerInvitesTable.inviteToken, token),
    with: {
      reservation: { with: { terrain: true, players: { with: { user: true } } } },
      invitedBy: true,
    },
  });
  if (!invite) throw new HttpError(404, "Invite not found", "NOT_FOUND");
  if (invite.status === "cancelled")
    throw new HttpError(410, "This invite was cancelled", "INVITE_CANCELLED");
  if (invite.status === "declined")
    throw new HttpError(410, "This invitation was declined", "INVITE_DECLINED");
  if (invite.invitedUserId != null && invite.status === "accepted")
    throw new HttpError(410, "This invitation was already accepted", "INVITE_USED");
  if (invite.status === "expired" || invite.expiresAt <= new Date())
    throw new HttpError(410, "This invite has expired", "INVITE_EXPIRED");
  if (invite.reservation.status !== "confirmed")
    throw new HttpError(410, "This match was cancelled", "MATCH_INACTIVE");
  return invite;
}

// ─── Resolve invite (public preview) ─────────────────────────────────────────
router.get("/invites/:token", async (req, res) => {
  const invite = await loadInvite(String(req.params.token));
  const r = invite.reservation;
  const filledSpots = r.players.length;
  const price = await quote(r.terrain!, r.startTime);
  res.json({
    invite: {
      id: invite.id,
      status: invite.status,
      expiresAt: invite.expiresAt,
      invitedBy: publicName(invite.invitedBy),
      /** Personal invitation (one member, accept or decline) vs shareable link */
      personal: invite.invitedUserId != null,
    },
    reservation: {
      id: r.id,
      terrainName: r.terrain?.name,
      terrainType: r.terrain?.type,
      startTime: r.startTime,
      endTime: r.endTime,
      bookingMode: r.bookingMode,
      totalSpots: r.totalSpots,
      filledSpots,
      openSpots: Math.max(0, r.totalSpots - filledSpots),
      players: r.players.map((p) => ({ name: publicName(p.user) })),
      // What joining costs this player
      free: r.bookingMode === "full_court",
      tokensPerSpot: price.tokensPerSpot,
      pricePerPerson: price.pricePerPerson,
    },
  });
});

// ─── Accept invite ───────────────────────────────────────────────────────────
router.post("/invites/:token/accept", requireUser, async (req, res) => {
  const user = me(req);
  const settings = await getSettings();
  if (!settings.invitationsEnabled) throw featureOff("Invitations");
  const invite = await loadInvite(String(req.params.token));
  if (invite.invitedUserId != null && invite.invitedUserId !== user.id)
    throw new HttpError(403, "This invitation is for another member", "FORBIDDEN");
  const r = invite.reservation;
  if (r.players.some((p) => p.userId === user.id))
    throw new HttpError(409, "You already have a spot in this match", "ALREADY_JOINED");
  if (r.startTime <= new Date())
    throw new HttpError(400, "This match has already started", "MATCH_STARTED");
  if (r.players.length >= r.totalSpots)
    throw new HttpError(409, "No open spots left in this match", "MATCH_FULL");

  const free = r.bookingMode === "full_court";
  const method = free ? "token" : playerMethod(req.body?.paymentMethod, settings);
  const price = await quote(r.terrain!, r.startTime);
  try {
    await db.transaction(async (tx: Tx) => {
      await addPlayer(
        tx,
        {
          id: r.id,
          bookingMode: r.bookingMode,
          terrainName: r.terrain?.name ?? "court",
          startTime: r.startTime,
        },
        user.id,
        method,
        price.tokensPerSpot,
        { viaInvite: true },
      );
      // A personal invitation is used once; a shared link stays valid for the others
      if (invite.invitedUserId != null)
        await tx
          .update(playerInvitesTable)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(eq(playerInvitesTable.id, invite.id));
    });
  } catch (err) {
    joinConflict(err);
  }

  const tokens = !free && method === "token" ? price.tokensPerSpot : 0;
  notifyLater(
    user,
    {
      kind: "booking_confirmed",
      terrain: r.terrain?.name ?? "",
      date: formatClubDate(r.startTime, (user.language ?? "fr") as Lang),
      time: formatClubTime(r.startTime),
      tokens,
      mode: "joined",
      isPeak: price.isPeak,
    },
    `join:${r.id}:${user.id}`,
  );
  res.status(201).json({
    message: "Joined via invite",
    reservationId: r.id,
    tokensCharged: tokens,
    paymentType: free ? "invited_free" : method,
  });
});

// ─── Personal invitations: list mine, decline ────────────────────────────────
router.get("/invites", requireUser, async (req, res) => {
  const user = me(req);
  const rows = await db.query.playerInvitesTable.findMany({
    where: and(
      eq(playerInvitesTable.invitedUserId, user.id),
      eq(playerInvitesTable.status, "pending"),
      gt(playerInvitesTable.expiresAt, new Date()),
    ),
    with: { reservation: { with: { terrain: true, players: true } }, invitedBy: true },
    orderBy: [desc(playerInvitesTable.createdAt)],
    limit: 20,
  });
  res.json(
    rows
      .filter((i) => i.reservation.status === "confirmed")
      .map((i) => ({
        id: i.id,
        token: i.inviteToken,
        invitedBy: publicName(i.invitedBy),
        createdAt: i.createdAt,
        reservation: {
          id: i.reservation.id,
          terrainName: i.reservation.terrain?.name ?? "",
          startTime: i.reservation.startTime,
          endTime: i.reservation.endTime,
          bookingMode: i.reservation.bookingMode,
          totalSpots: i.reservation.totalSpots,
          filledSpots: i.reservation.players.length,
          free: i.reservation.bookingMode === "full_court",
        },
      })),
  );
});

router.post("/invites/:token/decline", requireUser, async (req, res) => {
  const user = me(req);
  const invite = await loadInvite(String(req.params.token));
  if (invite.invitedUserId !== user.id)
    throw new HttpError(403, "Only the invited member can decline", "FORBIDDEN");
  await db
    .update(playerInvitesTable)
    .set({ status: "declined", respondedAt: new Date() })
    .where(and(eq(playerInvitesTable.id, invite.id), eq(playerInvitesTable.status, "pending")));
  res.json({ message: "Invitation declined" });
});

// ─── Find a member to invite: public names only, never e-mails or phones ────
router.get("/members/search", requireUser, async (req, res) => {
  const user = me(req);
  const q = cleanText(req.query.q, 60);
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(
      and(
        ne(usersTable.id, user.id),
        or(
          ilike(usersTable.firstName, like),
          ilike(usersTable.lastName, like),
          ilike(sql`${usersTable.firstName} || ' ' || ${usersTable.lastName}`, like),
          // An exact e-mail finds a member without revealing anyone's address
          eq(sql`lower(${usersTable.email})`, q.toLowerCase()),
        ),
      ),
    )
    .orderBy(asc(usersTable.firstName))
    .limit(10);
  res.json(rows.map((u) => ({ id: u.id, name: publicName(u) })));
});

// ─── Admin: mark a cash payment ──────────────────────────────────────────────
// Only cash_club spots change here. Token spots are settled by the ledger
// (join / leave / cancel) and invited spots cost nothing.
router.patch("/reservations/:id/players/:playerId", requireAdmin, async (req, res) => {
  const reservationId = requireId(req.params.id);
  const playerId = requireId(req.params.playerId, "player");
  const paymentStatus = oneOf(req.body?.paymentStatus, ["paid", "pending"] as const);
  if (!paymentStatus)
    throw new HttpError(400, "paymentStatus must be paid or pending", "VALIDATION_ERROR");

  const [row] = await db
    .select()
    .from(reservationPlayersTable)
    .where(
      and(
        eq(reservationPlayersTable.id, playerId),
        eq(reservationPlayersTable.reservationId, reservationId),
      ),
    );
  if (!row) throw new HttpError(404, "Player not found in this booking", "NOT_FOUND");
  if (row.paymentType !== "cash_club")
    throw new HttpError(400, "Only cash payments can be marked by hand", "NOT_CASH");

  const [updated] = await db
    .update(reservationPlayersTable)
    .set({ paymentStatus })
    .where(eq(reservationPlayersTable.id, row.id))
    .returning();
  res.json(updated);
});

// ─── Admin: add a member to a match ──────────────────────────────────────────
router.post("/reservations/:id/players", requireAdmin, async (req, res) => {
  const admin = me(req);
  const id = requireId(req.params.id);
  const userId = requireId(req.body?.userId, "member");
  const method: PayMethod =
    oneOf(req.body?.paymentType, ["token", "cash_club"] as const) ?? "cash_club";
  const cashPaid = req.body?.paymentStatus === "paid";

  const r = await loadMatch(id);
  if (r.status !== "confirmed")
    throw new HttpError(400, "This match is no longer active", "MATCH_INACTIVE");
  if (r.players.length >= r.totalSpots)
    throw new HttpError(409, "No open spots left in this match", "MATCH_FULL");
  if (r.players.some((p) => p.userId === userId))
    throw new HttpError(409, "This member is already in the match", "ALREADY_JOINED");
  const [member] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!member) throw new HttpError(404, "Member not found", "USER_NOT_FOUND");

  const price = await quote(r.terrain!, r.startTime);
  let player;
  try {
    player = await db.transaction((tx: Tx) =>
      addPlayer(
        tx,
        {
          id,
          bookingMode: r.bookingMode,
          terrainName: r.terrain?.name ?? "court",
          startTime: r.startTime,
        },
        userId,
        method,
        price.tokensPerSpot,
        { adminId: admin.id, cashPaid },
      ),
    );
  } catch (err) {
    joinConflict(err);
  }
  res.status(201).json(player);
});

// ─── Admin: remove a member from a match (token spots refunded) ──────────────
router.delete("/reservations/:id/players/:playerId", requireAdmin, async (req, res) => {
  const admin = me(req);
  const id = requireId(req.params.id);
  const playerId = requireId(req.params.playerId, "player");
  const r = await loadMatch(id);

  const out = await db.transaction(async (tx: Tx) => {
    await tx
      .select({ id: reservationsTable.id })
      .from(reservationsTable)
      .where(eq(reservationsTable.id, id))
      .for("update");
    const [row] = await tx
      .delete(reservationPlayersTable)
      .where(
        and(
          eq(reservationPlayersTable.id, playerId),
          eq(reservationPlayersTable.reservationId, id),
        ),
      )
      .returning();
    if (!row) throw new HttpError(404, "Player not found in this booking", "NOT_FOUND");
    let refunded = 0;
    if (row.paymentType === "token" && row.paymentStatus === "paid" && row.tokensCharged > 0) {
      await moveTokens(tx, {
        userId: row.userId,
        delta: row.tokensCharged,
        type: "credit",
        reservationId: id,
        adminId: admin.id,
        description: `Refund · removed from match · ${r.terrain?.name ?? "court"}`,
      });
      refunded = row.tokensCharged;
    }
    if (r.userId === row.userId) {
      const [next] = await tx
        .select()
        .from(reservationPlayersTable)
        .where(eq(reservationPlayersTable.reservationId, id))
        .orderBy(asc(reservationPlayersTable.joinedAt))
        .limit(1);
      if (next)
        await tx
          .update(reservationsTable)
          .set({ userId: next.userId })
          .where(eq(reservationsTable.id, id));
    }
    return { refunded, userId: row.userId };
  });
  res.json({ message: "Player removed", ...out });
});

// ─── Open matches (public matches with open spots) ───────────────────────────
router.get("/open-matches", async (_req, res) => {
  const settings = await getSettings();
  if (!settings.openMatchesEnabled) {
    res.json([]);
    return;
  }
  const sessions = await db.query.reservationsTable.findMany({
    where: and(
      eq(reservationsTable.status, "confirmed"),
      eq(reservationsTable.isPublic, true),
      eq(reservationsTable.bookingMode, "own_spot"),
      gt(reservationsTable.startTime, new Date()),
    ),
    with: { terrain: true, players: { with: { user: true } } },
    orderBy: [reservationsTable.startTime],
    limit: 50,
  });

  const rules = await loadActiveRules();
  const out = [];
  for (const s of sessions) {
    const openSpots = Math.max(0, s.totalSpots - s.players.length);
    if (!openSpots) continue;
    const price = priceFor(rules, settings, s.terrain!, s.startTime);
    out.push({
      reservationId: s.id,
      terrain: s.terrain,
      startTime: s.startTime,
      endTime: s.endTime,
      totalSpots: s.totalSpots,
      filledSpots: s.players.length,
      openSpots,
      publicDescription: s.publicDescription,
      tokensPerSpot: price.tokensPerSpot,
      isPeak: price.isPeak,
      // Public-safe: first name + initial only, no payment details
      players: s.players.map((p) => ({ name: publicName(p.user) })),
    });
  }
  res.json(out);
});

// ─── Make a match public / private (organiser or admin) ──────────────────────
async function setPublic(req: Request, isPublic: boolean) {
  const id = requireId(req.params.id);
  const user = me(req);
  const r = await loadMatch(id);
  if (user.role !== "admin" && r.userId !== user.id)
    throw new HttpError(403, "Only the organiser can change this", "FORBIDDEN");
  if (isPublic && !(await getSettings()).openMatchesEnabled) throw featureOff("Open matches");
  if (isPublic && r.bookingMode !== "own_spot")
    throw new HttpError(400, "Only matches with open spots can be public", "PRIVATE_MATCH");
  const [updated] = await db
    .update(reservationsTable)
    .set(
      isPublic
        ? { isPublic: true, publicDescription: cleanText(req.body?.publicDescription, 200) }
        : { isPublic: false },
    )
    .where(eq(reservationsTable.id, id))
    .returning();
  return updated;
}
router.post("/reservations/:id/open-match", requireUser, async (req, res) => {
  res.json(await setPublic(req, true));
});
router.delete("/reservations/:id/open-match", requireUser, async (req, res) => {
  res.json(await setPublic(req, false));
});

// ─── Admin: block a slot (maintenance, private event) ────────────────────────
router.post("/admin/slots/block", requireAdmin, async (req, res) => {
  const admin = me(req);
  const terrainId = requireId(req.body?.terrainId, "court");
  const reason = cleanText(req.body?.reason, 80) ?? "Maintenance";
  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, terrainId));
  if (!terrain) throw new HttpError(404, "Court not found", "NOT_FOUND");
  const start = new Date(req.body?.startTime);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Invalid start time", "INVALID_SLOT");
  const day = clubParts(start).date;
  const ctx = await scheduleContext(day, day);
  const end = assertBookable(ctx, terrain, start, { isAdmin: true });

  try {
    const [blocked] = await db
      .insert(reservationsTable)
      .values({
        terrainId: terrain.id,
        userId: null,
        guestName: `[${reason}]`,
        startTime: start,
        endTime: end,
        status: "confirmed",
        tokensCharged: 0,
        bookingType: "manual",
        bookingMode: "full_court",
        totalSpots: ctx.settings.maxPlayers,
        isPublic: false,
        notes: reason,
      })
      .returning();
    await db.insert(activityTable).values({
      type: "reservation_created",
      message: `${terrain.name} blocked: ${reason}`,
      userId: admin.id,
      userName: `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim() || admin.email,
    });
    res.status(201).json(blocked);
  } catch (err) {
    bookingConflict(err);
  }
});

export default router;
