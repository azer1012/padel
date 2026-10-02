import { Router } from "express";
import { notifyLater } from "../lib/notify";
import { db, usersTable } from "@workspace/db";
import { logActivity } from "../lib/activity";
import { and, count, desc, eq, ilike, ne, or } from "drizzle-orm";
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

/** Profile fields a user may edit on themselves (never role or balance). */
function profilePatch(body: Record<string, unknown> | undefined) {
  const patch: Partial<DbUser> = {};
  if (body?.firstName !== undefined) patch.firstName = cleanText(body.firstName, 80);
  if (body?.lastName !== undefined) patch.lastName = cleanText(body.lastName, 80);
  if (body?.phone !== undefined) {
    const phone = cleanText(body.phone, 30);
    if (phone && !/^[+\d][\d\s().-]{5,29}$/.test(phone))
      throw new HttpError(400, "Invalid phone number", "VALIDATION_ERROR");
    patch.phone = phone;
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
 * Idempotent fallback after sign-in. The database already creates the profile at
 * signup (auth.users trigger); this only fills it in for older accounts and never
 * overwrites what the player edited in their profile.
 */
router.post("/users/sync", requireAuth, async (req, res) => {
  // Never trust an email sent by the browser: use the one Supabase verified for this token.
  const { id: authUserId, email } = authIdentity(req);
  const firstName = cleanText(req.body?.firstName, 80);
  const lastName = cleanText(req.body?.lastName, 80);
  const avatar = cleanText(req.body?.imageUrl, 500);
  const avatarUrl = avatar && /^https:\/\//.test(avatar) ? avatar : null;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.supabaseAuthId, authUserId));
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
  const where = search
    ? or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`),
        ilike(usersTable.phone, `%${search}%`),
      )
    : undefined;
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
    .where(eq(usersTable.id, requireId(req.params.id)));
  if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");
  res.json(user);
});

/** Admin: edit a member's details or role. Token balances only change through /tokens/admin/adjust. */
router.patch("/users/:id", requireAdmin, async (req, res) => {
  const admin = currentUser(req);
  const id = requireId(req.params.id);
  const patch = profilePatch(req.body);
  const role =
    req.body?.role === undefined ? undefined : oneOf(req.body.role, ["admin", "player"] as const);
  if (role === null) throw new HttpError(400, "Invalid role", "VALIDATION_ERROR");
  if (role === "player") {
    if (id === admin.id)
      throw new HttpError(400, "You can't remove your own admin access", "SELF_DEMOTE");
    const [{ admins }] = await db
      .select({ admins: count() })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), ne(usersTable.id, id)));
    if (Number(admins) === 0)
      throw new HttpError(400, "The club needs at least one admin", "LAST_ADMIN");
  }
  const [updated] = await db
    .update(usersTable)
    .set({ ...patch, ...(role ? { role } : {}), updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) throw new HttpError(404, "User not found", "NOT_FOUND");
  if (role) await logActivity(req, "role_changed", `${updated.email} is now ${role}`, updated);
  res.json(updated);
});

export default router;
