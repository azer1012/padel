import { Router } from "express";
import { notifyLater } from "../lib/notify";
import { activityTable, db, usersTable, type Tx } from "@workspace/db";
import { deleteAccount, deletedAuthId } from "../lib/accounts";
import { logActivity } from "../lib/activity";
import { logger } from "../lib/logger";
import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { env } from "../config/env";
import { assertNotDemo, demoAccountOnly, demoPeopleOnly, isDemoEmail } from "../lib/demo";
import {
  authIdentity,
  currentUser,
  requireAuth,
  requireUser,
  requireAdmin,
  type DbUser,
} from "../lib/auth";
import { HttpError, cleanText, oneOf, paging, requireId } from "../lib/http";

const router = Router();
const LANGS = ["fr", "ar", "en"] as const;
const GENDERS = ["male", "female"] as const;
const PHONE = /^[+\d][\d\s().-]{5,29}$/;

/** Profile fields a user may edit on themselves (never role or balance). */
function profilePatch(body: Record<string, unknown> | undefined) {
  const patch: Partial<DbUser> = {};
  if (body?.firstName !== undefined) patch.firstName = cleanText(body.firstName, 80);
  if (body?.lastName !== undefined) patch.lastName = cleanText(body.lastName, 80);
  if (body?.phone !== undefined) {
    const phone = cleanText(body.phone, 30);
    if (phone && !PHONE.test(phone))
      throw new HttpError(400, "Invalid phone number", "VALIDATION_ERROR");
    patch.phone = phone;
  }
  if (body?.gender !== undefined) {
    const cleared = body.gender === null || body.gender === "";
    const gender = cleared ? null : oneOf(body.gender, GENDERS);
    if (!cleared && !gender) throw new HttpError(400, "Invalid gender", "VALIDATION_ERROR");
    patch.gender = gender;
  }
  if (body?.language !== undefined) {
    const language = oneOf(body.language, LANGS);
    if (!language) throw new HttpError(400, "Invalid language", "VALIDATION_ERROR");
    patch.language = language;
  }
  if (typeof body?.emailNotifications === "boolean")
    patch.emailNotifications = body.emailNotifications;
  if (typeof body?.pushNotifications === "boolean")
    patch.pushNotifications = body.pushNotifications;
  return patch;
}

router.get("/users/me", requireUser, async (req, res) => {
  res.json(currentUser(req));
});

router.patch("/users/me", requireUser, async (req, res) => {
  const [updated] = await db
    .update(usersTable)
    .set({ ...profilePatch(req.body), updatedAt: new Date() })
    .where(eq(usersTable.id, currentUser(req).id))
    .returning();
  res.json(updated);
});

/**
 * A member deletes their own account. Nothing is done by accident: the request must
 * say `confirm: true`, and when tokens are left, how many are given up
 * (`forfeitTokens`), so a balance that changed since the screen was drawn stops it.
 */
router.delete("/users/me", requireUser, async (req, res) => {
  // The demo's shared accounts belong to every visitor
  assertNotDemo("Deleting an account");
  const member = currentUser(req);
  if (req.body?.confirm !== true)
    throw new HttpError(400, "Confirm the deletion of the account", "CONFIRMATION_REQUIRED");
  const lost = await db.transaction((tx: Tx) => deleteAccount(tx, member, req.body?.forfeitTokens));
  // Filed without a name: the account no longer has one
  try {
    await db.insert(activityTable).values({
      type: "member_updated",
      message: `A member deleted their account${lost ? ` (${lost} token(s) given up)` : ""}`,
      userId: member.id,
      userName: null,
    });
  } catch (err) {
    logger.error({ err }, "activity log entry refused");
  }
  res.status(204).end();
});

/**
 * Idempotent fallback after sign-in. The database already creates the profile at
 * signup (auth.users trigger); this only fills it in for older accounts and never
 * overwrites what the player edited in their profile.
 */
router.post("/users/sync", requireAuth, async (req, res) => {
  // Never trust an email sent by the browser: use the one Supabase verified for this token.
  const { id: authUserId, email } = authIdentity(req);
  if (env.demoMode && !isDemoEmail(email)) throw demoAccountOnly();
  const firstName = cleanText(req.body?.firstName, 80);
  const lastName = cleanText(req.body?.lastName, 80);
  const avatar = cleanText(req.body?.imageUrl, 500);
  const avatarUrl = avatar && /^https:\/\//.test(avatar) ? avatar : null;
  // Signup metadata is browser-written: keep only well-formed values, never fail the sync.
  const rawPhone = cleanText(req.body?.phone, 30);
  const phone = rawPhone && PHONE.test(rawPhone) ? rawPhone : null;
  const gender = oneOf(req.body?.gender, GENDERS) ?? null;

  // A session still open after its account was deleted never brings the account back
  const [gone] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.supabaseAuthId, deletedAuthId(authUserId)));
  if (gone) throw new HttpError(403, "This account was deleted", "ACCOUNT_DELETED");

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.supabaseAuthId, authUserId));
  if (existing?.blockedAt)
    throw new HttpError(403, "This account is suspended: contact the club", "ACCOUNT_BLOCKED");
  let user: DbUser;
  let created = false;
  if (existing) {
    [user] = await db
      .update(usersTable)
      .set({
        ...(email && email !== existing.email ? { email } : {}),
        ...(!existing.firstName && firstName ? { firstName } : {}),
        ...(!existing.lastName && lastName ? { lastName } : {}),
        ...(!existing.avatarUrl && avatarUrl ? { avatarUrl } : {}),
        ...(!existing.phone && phone ? { phone } : {}),
        ...(!existing.gender && gender ? { gender } : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing.id))
      .returning();
  } else {
    const inserted = await db
      .insert(usersTable)
      .values({
        supabaseAuthId: authUserId,
        email: email || `${authUserId}@placeholder.local`,
        firstName,
        lastName,
        phone,
        gender,
        avatarUrl,
        role: "player",
        tokenBalance: 0,
        language: "fr",
      })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) {
      user = inserted[0];
      created = true;
    } else {
      [user] = await db.select().from(usersTable).where(eq(usersTable.supabaseAuthId, authUserId));
      if (!user)
        throw new HttpError(409, "This email is already linked to another account", "EMAIL_TAKEN");
    }
  }
  // Idempotent (notification_log): sent once per user, whoever created the row.
  notifyLater(user, { kind: "welcome", firstName: user.firstName }, "welcome");
  res.status(created ? 201 : 200).json(user);
});

router.get("/users", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = paging(q, 20, 200);
  const search = cleanText(q.search, 80)?.replace(/[%_\\]/g, (c) => `\\${c}`);
  const where = and(
    search
      ? or(
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.firstName, `%${search}%`),
          ilike(usersTable.lastName, `%${search}%`),
          ilike(usersTable.phone, `%${search}%`),
        )
      : undefined,
    demoPeopleOnly(),
    // A deleted account is nobody any more
    isNull(usersTable.deletedAt),
  );
  const [{ total }] = await db.select({ total: count() }).from(usersTable).where(where);
  const data = await db
    .select()
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json({ data, total: Number(total), page, limit });
});

router.get("/users/:id", requireAdmin, async (req, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, requireId(req.params.id)), demoPeopleOnly()));
  if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");
  res.json(user);
});

/**
 * Admin: edit a member's details or role, block or unblock them. Token balances only
 * change through /tokens/admin/adjust.
 *
 * `blocked: true` (with an optional `blockedReason`) closes the API to the member:
 * no booking, no order, no sign-in beyond the "account suspended" screen. Their
 * bookings and tokens stay as they are, for the desk to settle.
 */
router.patch("/users/:id", requireAdmin, async (req, res) => {
  const admin = currentUser(req);
  const id = requireId(req.params.id);
  const patch = profilePatch(req.body);
  const role =
    req.body?.role === undefined ? undefined : oneOf(req.body.role, ["admin", "player"] as const);
  if (role === null) throw new HttpError(400, "Invalid role", "VALIDATION_ERROR");
  // A visitor promoting or demoting the shared accounts would break the demo for the next
  if (role !== undefined) assertNotDemo("Changing roles");
  if (role === "player" && id === admin.id)
    throw new HttpError(400, "You can't remove your own admin access", "SELF_DEMOTE");
  const blocked = typeof req.body?.blocked === "boolean" ? req.body.blocked : undefined;
  if (blocked !== undefined) assertNotDemo("Blocking members");
  if (blocked && id === admin.id)
    throw new HttpError(400, "You can't block your own account", "SELF_BLOCK");
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target || target.deletedAt) throw new HttpError(404, "User not found", "NOT_FOUND");
  if (blocked && (role ?? target.role) === "admin")
    throw new HttpError(400, "Remove the admin access before blocking", "ADMIN_NOT_BLOCKABLE");
  if (role === "admin" && (blocked ?? !!target.blockedAt))
    throw new HttpError(400, "Unblock this member before giving admin access", "BLOCKED_MEMBER");
  if (blocked !== undefined) {
    patch.blockedAt = blocked ? (target.blockedAt ?? new Date()) : null;
    patch.blockedReason = blocked ? cleanText(req.body?.blockedReason, 200) : null;
  }
  const [updated] = await db.transaction(async (tx) => {
    if (role === "player") {
      // Locks the admin rows: two admins demoting each other at the same instant
      // are checked one after the other, so the club always keeps one
      const admins = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"))
        .for("no key update");
      if (!admins.some((a) => a.id !== id))
        throw new HttpError(400, "The club needs at least one admin", "LAST_ADMIN");
    }
    return tx
      .update(usersTable)
      .set({ ...patch, ...(role ? { role } : {}), updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();
  });
  if (!updated) throw new HttpError(404, "User not found", "NOT_FOUND");
  if (role) await logActivity(req, "role_changed", `${updated.email} is now ${role}`, updated);
  if (blocked !== undefined && !!target.blockedAt !== blocked)
    await logActivity(
      req,
      "member_updated",
      blocked
        ? `${updated.email} blocked${updated.blockedReason ? `: ${updated.blockedReason}` : ""}`
        : `${updated.email} unblocked`,
      updated,
    );
  res.json(updated);
});

export default router;
