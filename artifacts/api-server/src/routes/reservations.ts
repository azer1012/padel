import { Router } from "express";
import {
  db,
  reservationsTable,
  terrainsTable,
  usersTable,
  activityTable,
  reservationPlayersTable,
  type Tx,
} from "@workspace/db";
import { eq, and, gte, lt, desc, count, inArray, or } from "drizzle-orm";
import { currentUser, requireUser, requireAdmin, type DbUser } from "../lib/auth";
import { loadActiveRules, priceFor, tokensFor } from "../lib/pricing";
import { notifyLater } from "../lib/notify";
import {
  addDays,
  clubInstant,
  clubParts,
  formatClubDate,
  formatClubStamp,
  formatClubTime,
  isClubDate,
} from "../lib/club-time";
import { normalizeRequest, reserveEquipment } from "../lib/equipment";
import { moveTokens } from "../lib/ledger";
import {
  bookingConflict,
  lateCancellation,
  refundPlayers,
  releaseEquipment,
} from "../lib/bookings";
import { fullName } from "../lib/members";
import { assertBookable } from "../lib/slots";
import { getSettings, scheduleContext } from "../lib/settings";
import { HttpError, cleanText, oneOf, paging, requireId, toId } from "../lib/http";
import { earnLoyalty, loyaltyFor } from "../lib/loyalty";

const router = Router();

const withDetails = {
  terrain: true,
  user: true,
  players: { with: { user: true } },
  equipment: { with: { item: true } },
} as const;

/** What a member may know about another member of the same match: a name, never contact details, balance or auth id. */
const publicUser = (u: DbUser | null | undefined) =>
  u
    ? {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName?.trim() ? `${u.lastName.trim().charAt(0)}.` : null,
        avatarUrl: u.avatarUrl,
      }
    : null;

type Detailed = {
  userId: number | null;
  guestPhone: string | null;
  notes: string | null;
  user: DbUser | null;
  players: { userId: number; notes: string | null; user: DbUser | null }[];
};

/**
 * Admins see everything. A player sees their own row in full and only the public
 * name of the other players; desk notes and guest phones stay with the booker.
 */
function forViewer<T extends Detailed>(r: T, viewer: DbUser) {
  if (viewer.role === "admin") return r;
  const booker = r.userId === viewer.id;
  return {
    ...r,
    guestPhone: booker ? r.guestPhone : null,
    notes: booker ? r.notes : null,
    user: booker ? r.user : publicUser(r.user),
    players: r.players.map((p) =>
      p.userId === viewer.id ? p : { ...p, notes: null, user: publicUser(p.user) },
    ),
  };
}

/** Reservation ids where the user is the creator or a player. */
async function myReservationIds(userId: number) {
  const rows = await db
    .select({ id: reservationPlayersTable.reservationId })
    .from(reservationPlayersTable)
    .where(eq(reservationPlayersTable.userId, userId));
  const joined = rows.map((r) => r.id);
  return joined.length
    ? or(eq(reservationsTable.userId, userId), inArray(reservationsTable.id, joined))
    : eq(reservationsTable.userId, userId);
}

router.get("/reservations/upcoming", requireUser, async (req, res) => {
  const user = currentUser(req);
  const reservations = await db.query.reservationsTable.findMany({
    where: and(
      gte(reservationsTable.endTime, new Date()),
      eq(reservationsTable.status, "confirmed"),
      await myReservationIds(user.id),
    ),
    with: withDetails,
    orderBy: [reservationsTable.startTime],
    limit: 20,
  });
  res.json(reservations.map((r) => forViewer(r, user)));
});

router.get("/reservations", requireUser, async (req, res) => {
  const user = currentUser(req);
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = paging(q, 20, 100);
  const conditions = [];

  if (user.role !== "admin") conditions.push(await myReservationIds(user.id));
  else if (toId(q.userId)) conditions.push(eq(reservationsTable.userId, toId(q.userId)!));

  if (q.date) {
    if (!isClubDate(q.date)) throw new HttpError(400, "Invalid date", "VALIDATION_ERROR");
    conditions.push(
      gte(reservationsTable.startTime, clubInstant(q.date, 0)),
      lt(reservationsTable.startTime, clubInstant(addDays(q.date, 1), 0)),
    );
  }
  if (toId(q.terrainId)) conditions.push(eq(reservationsTable.terrainId, toId(q.terrainId)!));
  const status = oneOf(q.status, ["confirmed", "cancelled", "pending"] as const);
  if (status) conditions.push(eq(reservationsTable.status, status));

  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(reservationsTable).where(where);
  const data = await db.query.reservationsTable.findMany({
    where,
    with: withDetails,
    orderBy: [desc(reservationsTable.startTime)],
    limit,
    offset,
  });
  res.json({ data: data.map((r) => forViewer(r, user)), total: Number(total), page, limit });
});

/**
 * Book a court. Duration, spots, prices and the booking window come from the club settings.
 * Player:  bookingMode full_court (full-court token price, friends then join free) or
 *          own_spot (one spot, the other spots stay open).
 * Admin:   same, on behalf of a member (userId) paid by token or cash at the club,
 *          or for a walk-in / phone guest (guestName, no account).
 */
router.post("/reservations", requireUser, async (req, res) => {
  const booker = currentUser(req);
  const isAdmin = booker.role === "admin";
  const b = req.body ?? {};

  const terrainId = requireId(b.terrainId, "court");
  const bookingMode = oneOf(b.bookingMode ?? "full_court", ["full_court", "own_spot"] as const);
  if (!bookingMode) throw new HttpError(400, "Invalid booking mode", "VALIDATION_ERROR");
  const start = new Date(b.startTime);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Invalid start time", "INVALID_SLOT");

  const [terrain] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, terrainId));
  if (!terrain) throw new HttpError(400, "This court is not available", "COURT_UNAVAILABLE");
  const day = clubParts(start).date;
  const ctx = await scheduleContext(day, day);
  const settings = ctx.settings;
  const end = assertBookable(ctx, terrain, start, { isAdmin });

  // Who is the booking for, and how is it paid?
  let member: DbUser | null = booker;
  let paymentMethod: "token" | "cash_club" = "token";
  let guestName: string | null = null;
  let guestPhone: string | null = null;
  let bookingType: "online" | "phone" | "manual" = "online";
  if (isAdmin) {
    bookingType = oneOf(b.bookingType, ["online", "phone", "manual"] as const) ?? "phone";
    guestName = cleanText(b.guestName, 80);
    guestPhone = cleanText(b.guestPhone, 30);
    const memberId = toId(b.userId);
    if (memberId) {
      [member] = await db.select().from(usersTable).where(eq(usersTable.id, memberId));
      if (!member) throw new HttpError(404, "Member not found", "USER_NOT_FOUND");
      paymentMethod = oneOf(b.paymentMethod, ["token", "cash_club"] as const) ?? "token";
    } else if (guestName) {
      member = null;
    } else if (b.forSelf !== true) {
      throw new HttpError(400, "Pick a member or enter the guest's name", "VALIDATION_ERROR");
    }
  }

  const price = priceFor(await loadActiveRules(), settings, terrain, start);
  const tokensNeeded = tokensFor(price, bookingMode);
  const chargeTokens = member !== null && paymentMethod === "token";
  const isPublic = bookingMode === "own_spot" && b.isPublic === true && settings.openMatchesEnabled;
  const equipmentReq = normalizeRequest(b.equipment);
  let gear: { name: string; quantity: number; price: number }[] = [];
  // Fidélité: only a booking paid with tokens earns a reward
  const loyaltyEarned = chargeTokens ? loyaltyFor(settings, tokensNeeded) : 0;
  let loyaltyCredited = 0;

  let reservationId: number;
  try {
    reservationId = await db.transaction(async (tx: Tx) => {
      const [reservation] = await tx
        .insert(reservationsTable)
        .values({
          terrainId: terrain.id,
          userId: member?.id ?? null,
          guestName: member ? null : guestName,
          guestPhone: member ? null : guestPhone,
          startTime: start,
          endTime: end,
          status: "confirmed",
          tokensCharged: chargeTokens ? tokensNeeded : 0,
          bookingType,
          bookingMode,
          totalSpots: settings.maxPlayers,
          isPublic,
          publicDescription: isPublic ? cleanText(b.publicDescription, 200) : null,
          notes: cleanText(b.notes, 500),
        })
        .returning();

      if (member) {
        // Debit after the slot is secured: an overlap aborts before any token moves.
        if (chargeTokens) {
          await moveTokens(tx, {
            userId: member.id,
            delta: -tokensNeeded,
            type: "debit",
            reservationId: reservation.id,
            adminId: isAdmin ? booker.id : null,
            description: `${bookingMode === "own_spot" ? "Own spot" : "Full court"} · ${terrain.name} · ${formatClubStamp(start)}`,
          });
        }
        await tx.insert(reservationPlayersTable).values({
          reservationId: reservation.id,
          userId: member.id,
          paymentType: chargeTokens ? "token" : "cash_club",
          paymentStatus: chargeTokens ? "paid" : "pending",
          tokensCharged: chargeTokens ? tokensNeeded : 0,
          loyaltyEarned,
        });
        loyaltyCredited = await earnLoyalty(tx, {
          userId: member.id,
          earned: loyaltyEarned,
          reservationId: reservation.id,
        });
      }

      gear = await reserveEquipment(tx, {
        reservationId: reservation.id,
        userId: member?.id ?? null,
        start,
        end,
        items: equipmentReq,
      });

      await tx.insert(activityTable).values({
        type: "reservation_created",
        message: `${terrain.name} · ${formatClubStamp(start)} (${bookingMode === "own_spot" ? "own spot" : "full court"}${isAdmin ? `, by ${fullName(booker)}` : ""})`,
        userId: member?.id ?? null,
        userName: member ? fullName(member) : (guestName ?? "Guest"),
      });
      return reservation.id;
    });
  } catch (err) {
    bookingConflict(err);
  }

  if (member) {
    notifyLater(
      member,
      {
        kind: "booking_confirmed",
        terrain: terrain.name,
        date: formatClubDate(start, member.language),
        time: formatClubTime(start),
        tokens: chargeTokens ? tokensNeeded : 0,
        mode: bookingMode,
        isPeak: price.isPeak,
        equipment: gear,
      },
      `booking:${reservationId}`,
    );
    // The reward reached a whole token: it is in the wallet, say so
    if (loyaltyCredited > 0)
      notifyLater(
        member,
        {
          kind: "tokens_added",
          amount: loyaltyCredited,
          balance: member.tokenBalance - (chargeTokens ? tokensNeeded : 0) + loyaltyCredited,
          reason:
            member.language === "en"
              ? "Loyalty reward"
              : member.language === "ar"
                ? "مكافأة الوفاء"
                : "Récompense fidélité",
        },
        `loyalty:${reservationId}`,
      );
  }
  const full = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, reservationId),
    with: withDetails,
  });
  res.status(201).json(
    full
      ? {
          ...forViewer(full, booker),
          loyalty: { earned: loyaltyEarned, credited: loyaltyCredited },
        }
      : full,
  );
});

router.get("/reservations/:id", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = currentUser(req);
  const reservation = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: withDetails,
  });
  if (!reservation) throw new HttpError(404, "Reservation not found", "NOT_FOUND");
  const isPlayer = reservation.players.some((p) => p.userId === user.id);
  if (user.role !== "admin" && reservation.userId !== user.id && !isPlayer)
    throw new HttpError(403, "Forbidden", "FORBIDDEN");
  res.json(forViewer(reservation, user));
});

/** Admin: edit notes only. Status changes go through /cancel so refunds always happen. */
router.patch("/reservations/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  if (req.body?.status !== undefined && req.body.status !== "confirmed")
    throw new HttpError(400, "Use the cancel action to cancel a booking", "USE_CANCEL");
  // Only what the request carries: a body without notes must not erase them
  const patch = req.body?.notes === undefined ? {} : { notes: cleanText(req.body.notes, 500) };
  const [updated] = Object.keys(patch).length
    ? await db.update(reservationsTable).set(patch).where(eq(reservationsTable.id, id)).returning()
    : await db.select().from(reservationsTable).where(eq(reservationsTable.id, id));
  if (!updated) throw new HttpError(404, "Reservation not found", "NOT_FOUND");
  res.json(updated);
});

/**
 * Cancel a whole booking: creator (within the cancellation rules) or admin (any time).
 * Every player who paid with tokens is refunded in the same transaction, except the
 * creator's own tokens on a late 'no_refund' cancellation.
 */
router.post("/reservations/:id/cancel", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = currentUser(req);
  const isAdmin = user.role === "admin";

  const check = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { terrain: true, players: true },
  });
  if (!check) throw new HttpError(404, "Reservation not found", "NOT_FOUND");
  if (!isAdmin && check.userId !== user.id)
    throw new HttpError(403, "Only the person who booked can cancel", "FORBIDDEN");
  const forfeit = isAdmin ? false : lateCancellation(await getSettings(), check.startTime);

  const refunds = await db.transaction(async (tx: Tx) => {
    const [locked] = await tx
      .select()
      .from(reservationsTable)
      .where(and(eq(reservationsTable.id, id), eq(reservationsTable.status, "confirmed")))
      .for("update");
    if (!locked) throw new HttpError(400, "This booking is already cancelled", "ALREADY_CANCELLED");

    await tx
      .update(reservationsTable)
      .set({ status: "cancelled" })
      .where(eq(reservationsTable.id, id));
    const out = await refundPlayers(
      tx,
      id,
      `Refund · ${check.terrain?.name ?? "court"} cancelled`,
      isAdmin ? user.id : null,
      forfeit ? user.id : null,
    );
    await releaseEquipment(tx, id);
    await tx.insert(activityTable).values({
      type: "reservation_cancelled",
      message: `${check.terrain?.name ?? "Court"} · ${formatClubStamp(check.startTime)} cancelled${isAdmin ? ` by ${fullName(user)}` : ""}`,
      userId: check.userId,
      userName: fullName(user),
    });
    return out;
  });

  // Everyone in the match hears about it, refunded or not
  const recipients = new Map<number, number>();
  for (const p of check.players) recipients.set(p.userId, 0);
  if (check.userId) recipients.set(check.userId, recipients.get(check.userId) ?? 0);
  for (const r of refunds) recipients.set(r.userId, (recipients.get(r.userId) ?? 0) + r.amount);
  const members = recipients.size
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, [...recipients.keys()]))
    : [];
  for (const u of members) {
    notifyLater(
      u,
      {
        kind: "booking_cancelled",
        terrain: check.terrain?.name ?? "",
        date: formatClubDate(check.startTime, u.language),
        time: formatClubTime(check.startTime),
        refunded: recipients.get(u.id) ?? 0,
      },
      `cancel:${id}`,
    );
  }

  const updated = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
  });
  res.json({ ...updated, refundForfeited: forfeit });
});

// ─── Add rental equipment to an existing booking ─────────────────────────────
router.post("/reservations/:id/equipment", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const user = currentUser(req);
  const items = normalizeRequest(req.body?.items);
  if (!items.length) throw new HttpError(400, "No equipment selected", "VALIDATION_ERROR");
  const r = await db.query.reservationsTable.findFirst({
    where: eq(reservationsTable.id, id),
    with: { players: true },
  });
  if (!r || r.status !== "confirmed")
    throw new HttpError(404, "Reservation not found", "NOT_FOUND");
  const inMatch = r.userId === user.id || r.players.some((p) => p.userId === user.id);
  if (!inMatch && user.role !== "admin") throw new HttpError(403, "Forbidden", "FORBIDDEN");
  if (r.startTime <= new Date())
    throw new HttpError(400, "This match has already started", "MATCH_STARTED");
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
  } catch (err) {
    bookingConflict(err);
  }
});

export default router;
