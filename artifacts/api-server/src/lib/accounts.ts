import {
  activityTable,
  notificationLogTable,
  notificationsTable,
  playerInvitesTable,
  pushSubscriptionsTable,
  reservationPlayersTable,
  reservationsTable,
  shopOrdersTable,
  tournamentRegistrationsTable,
  tournamentsTable,
  usersTable,
  type Tx,
} from "@workspace/db";
import { and, count, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import type { DbUser } from "./auth";
import { HttpError } from "./http";
import { moveTokens } from "./ledger";

/** Where a deleted account's e-mail goes: a domain reserved for names that never resolve. */
const deletedEmail = (id: number) => `deleted-${id}@deleted.invalid`;
/** A deleted account keeps a trace of its sign-in id, so a session still open cannot recreate it. */
export const deletedAuthId = (authId: string) => `deleted:${authId}`;

/**
 * A member deletes their own account (inside the caller's transaction).
 *
 * Refused while something is still going on: a booking to come, a boutique order in
 * progress, or the club's last admin. The tokens left are given up (written in the
 * ledger). The row itself stays, because past bookings and the ledger point to it,
 * but nothing personal is left on it or on what it wrote; the sign-in record goes.
 * `forfeitTokens` is the number of tokens the member's screen showed as given up: a
 * balance that moved since stops the deletion. Returns the tokens given up.
 */
export async function deleteAccount(
  tx: Tx,
  member: DbUser,
  forfeitTokens: unknown,
): Promise<number> {
  const [me] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, member.id))
    .for("no key update");
  if (!me || me.deletedAt) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  if (me.role === "admin") {
    // Same lock as a demotion: the club always keeps one admin
    const admins = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .for("no key update");
    if (!admins.some((a) => a.id !== me.id))
      throw new HttpError(400, "The club needs at least one admin", "LAST_ADMIN");
  }

  const now = new Date();
  const [{ bookings }] = await tx
    .select({ bookings: count() })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.status, "confirmed"),
        gt(reservationsTable.endTime, now),
        or(
          eq(reservationsTable.userId, me.id),
          sql`exists (select 1 from ${reservationPlayersTable} p
                       where p.reservation_id = ${reservationsTable.id} and p.user_id = ${me.id})`,
        ),
      ),
    );
  if (Number(bookings) > 0)
    throw new HttpError(
      409,
      "Cancel or leave your upcoming matches before deleting your account",
      "HAS_UPCOMING_BOOKINGS",
      { count: Number(bookings) },
    );
  const [{ orders }] = await tx
    .select({ orders: count() })
    .from(shopOrdersTable)
    .where(
      and(
        eq(shopOrdersTable.userId, me.id),
        inArray(shopOrdersTable.status, ["pending", "confirmed", "shipped"]),
      ),
    );
  if (Number(orders) > 0)
    throw new HttpError(
      409,
      "A boutique order is still in progress: wait for it, or ask the club to cancel it",
      "HAS_OPEN_ORDERS",
      { count: Number(orders) },
    );

  // The tokens left are given up, on the record: only the number the member agreed to
  const lost = me.tokenBalance;
  if (lost > 0 && Number(forfeitTokens) !== lost)
    throw new HttpError(
      409,
      `You still have ${lost} token(s): confirm that you give them up`,
      "TOKENS_LEFT",
      { tokens: lost },
    );
  if (lost > 0)
    await moveTokens(tx, {
      userId: me.id,
      delta: -lost,
      type: "debit",
      description: "Account deleted",
    });

  // Teams still entered in a tournament to come leave it
  const teams = await tx
    .delete(tournamentRegistrationsTable)
    .where(
      and(
        eq(tournamentRegistrationsTable.userId, me.id),
        sql`${tournamentRegistrationsTable.tournamentId} in
            (select id from ${tournamentsTable} where status in ('upcoming', 'open'))`,
      ),
    )
    .returning({ tournamentId: tournamentRegistrationsTable.tournamentId });
  for (const t of teams)
    await tx
      .update(tournamentsTable)
      .set({ registeredTeams: sql`greatest(${tournamentsTable.registeredTeams} - 1, 0)` })
      .where(eq(tournamentsTable.id, t.tournamentId));
  await tx
    .update(tournamentRegistrationsTable)
    .set({ teamName: null })
    .where(eq(tournamentRegistrationsTable.userId, me.id));

  // What was theirs alone
  await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, me.id));
  await tx.delete(notificationsTable).where(eq(notificationsTable.userId, me.id));
  await tx.delete(notificationLogTable).where(eq(notificationLogTable.userId, me.id));
  await tx
    .update(playerInvitesTable)
    .set({ status: "cancelled", respondedAt: now })
    .where(
      and(
        eq(playerInvitesTable.status, "pending"),
        or(
          eq(playerInvitesTable.invitedUserId, me.id),
          eq(playerInvitesTable.invitedByUserId, me.id),
        ),
      ),
    );

  // What they wrote elsewhere: past orders keep their articles and total, not the person
  await tx
    .update(shopOrdersTable)
    .set({ contactName: "—", contactPhone: "—", address: null, city: null, notes: null })
    .where(eq(shopOrdersTable.userId, me.id));
  await tx
    .update(activityTable)
    .set({
      userName: null,
      message: sql`replace(${activityTable.message}, ${me.email}, 'a deleted account')`,
    })
    .where(
      or(eq(activityTable.userId, me.id), sql`${activityTable.message} like ${`%${me.email}%`}`),
    );

  await tx
    .update(usersTable)
    .set({
      email: deletedEmail(me.id),
      supabaseAuthId: deletedAuthId(me.supabaseAuthId),
      firstName: null,
      lastName: null,
      phone: null,
      gender: null,
      avatarUrl: null,
      role: "player",
      loyaltyBalance: 0,
      emailNotifications: false,
      pushNotifications: false,
      blockedAt: null,
      blockedReason: null,
      deletedAt: now,
      updatedAt: now,
    })
    .where(and(eq(usersTable.id, me.id), ne(usersTable.email, deletedEmail(me.id))));

  // The sign-in record, in the same transaction: either both go or neither does
  if (/^[0-9a-f-]{36}$/i.test(me.supabaseAuthId))
    await tx.execute(sql`delete from auth.users where id = ${me.supabaseAuthId}::uuid`);
  return lost;
}
