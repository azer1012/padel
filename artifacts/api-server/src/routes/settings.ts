import { Router } from "express";
import {
  db,
  clubSettingsTable,
  openingHoursTable,
  scheduleExceptionsTable,
  tokenPackagesTable,
  tokenTransactionsTable,
  terrainsTable,
} from "@workspace/db";
import { asc, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { currentUser, requireAdmin } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { countUpcomingBookings } from "../lib/bookings";
import { HttpError, cleanText, pgCode, requireId, toMoney, type Body } from "../lib/http";
import { getOpeningHours, getSettings, invalidateSettings, publicSettings } from "../lib/settings";
import { isValidCloseHhmm, isValidHhmm } from "../lib/slots";
import { addDays, clubParts, isClubDate } from "../lib/club-time";

const router = Router();

/**
 * Every editable setting with its allowed range. Mirrors the CHECK constraints of
 * club_settings (the database refuses anything this lets through by mistake).
 */
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const money = z.number().min(0).max(100_000);
const settingsPatch = z
  .object({
    bookingDurationMinutes: int(30, 240).refine((v) => v % 5 === 0, "Multiple of 5 minutes"),
    minPlayers: int(1, 8),
    maxPlayers: int(1, 8),
    minAdvanceMinutes: int(0, 10_080),
    maxAdvanceDays: int(1, 365),
    cancellationNoticeHours: int(0, 168),
    lateCancellation: z.enum(["forbid", "no_refund"]),
    currency: z.string().regex(/^[A-Z]{3}$/, "3-letter ISO code, e.g. TND"),
    playerPrice: money,
    fullCourtPrice: money,
    tokenCostPlayer: int(0, 100),
    tokenCostFullCourt: int(0, 400),
    tokenUnitPrice: money,
    tokenMinPurchase: int(1, 1000),
    openMatchesEnabled: z.boolean(),
    invitationsEnabled: z.boolean(),
    cashPaymentEnabled: z.boolean(),
    bookingConfirmationNotificationsEnabled: z.boolean(),
    remindersEnabled: z.boolean(),
    reminderLeadMinutes: int(15, 1440),
    cancellationNotificationsEnabled: z.boolean(),
    invitationNotificationsEnabled: z.boolean(),
    tokenNotificationsEnabled: z.boolean(),
    matchFinishedNotificationsEnabled: z.boolean(),
  })
  .partial()
  .strict();
type SettingsPatch = z.infer<typeof settingsPatch>;
type SettingKey = keyof SettingsPatch;

/** Fields reset together by "Reset to default" in each section of Réglages. */
const SECTIONS: Record<string, SettingKey[]> = {
  booking: [
    "bookingDurationMinutes",
    "minPlayers",
    "maxPlayers",
    "minAdvanceMinutes",
    "maxAdvanceDays",
    "cancellationNoticeHours",
    "lateCancellation",
  ],
  pricing: ["currency", "playerPrice", "fullCourtPrice"],
  tokens: ["tokenCostPlayer", "tokenCostFullCourt", "tokenUnitPrice", "tokenMinPurchase"],
  features: ["openMatchesEnabled", "invitationsEnabled", "cashPaymentEnabled"],
  notifications: [
    "bookingConfirmationNotificationsEnabled",
    "remindersEnabled",
    "reminderLeadMinutes",
    "cancellationNotificationsEnabled",
    "invitationNotificationsEnabled",
    "tokenNotificationsEnabled",
    "matchFinishedNotificationsEnabled",
  ],
};

function validationError(err: z.ZodError): never {
  const first = err.issues[0];
  throw new HttpError(
    400,
    `${first.path.join(".") || "settings"}: ${first.message}`,
    "VALIDATION_ERROR",
    { issues: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
  );
}

// ─── Public: the rules every screen needs (prices, duration, features) ───────
router.get("/settings", async (_req, res) => {
  const [settings, hours, packages] = await Promise.all([
    getSettings(),
    getOpeningHours(),
    db
      .select()
      .from(tokenPackagesTable)
      .where(eq(tokenPackagesTable.isActive, true))
      .orderBy(asc(tokenPackagesTable.sortOrder), asc(tokenPackagesTable.tokens)),
  ]);
  // Rules change from Réglages and must reach players at once: never serve a cached copy
  res.set("Cache-Control", "no-cache");
  res.json({
    ...publicSettings(settings, hours),
    tokenPackages: packages.map((p) => ({
      id: p.id,
      name: p.name,
      tokens: p.tokens,
      price: p.price,
    })),
  });
});

// ─── Admin: read / update / reset ────────────────────────────────────────────
router.get("/admin/settings", requireAdmin, async (_req, res) => {
  invalidateSettings();
  const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
  res.json({ ...settings, openingHours: hours, upcomingBookings: await countUpcomingBookings() });
});

router.patch("/admin/settings", requireAdmin, async (req, res) => {
  const parsed = settingsPatch.safeParse(req.body ?? {});
  if (!parsed.success) validationError(parsed.error);
  const patch = parsed.data;
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update", "VALIDATION_ERROR");

  const current = await getSettings();
  const next = { ...current, ...patch };
  if (next.minPlayers > next.maxPlayers)
    throw new HttpError(
      400,
      "The minimum number of players cannot exceed the maximum",
      "VALIDATION_ERROR",
      { issues: [{ field: "minPlayers", message: "≤ maxPlayers" }] },
    );

  const admin = currentUser(req);
  const [saved] = await db
    .update(clubSettingsTable)
    .set({ ...patch, updatedAt: new Date(), updatedBy: admin.id })
    .where(eq(clubSettingsTable.id, 1))
    .returning();
  invalidateSettings();
  const changed = (Object.keys(patch) as SettingKey[])
    .filter((k) => current[k] !== saved[k])
    .map((k) => `${k}: ${String(current[k])} → ${String(saved[k])}`);
  if (changed.length)
    await logActivity(req, "settings_updated", `Settings changed · ${changed.join(", ")}`);
  res.json({
    ...saved,
    openingHours: await getOpeningHours(),
    upcomingBookings: await countUpcomingBookings(),
  });
});

/** Back to the installation defaults (the column defaults of club_settings). */
router.post("/admin/settings/reset", requireAdmin, async (req, res) => {
  const section = String(req.body?.section ?? "");
  const admin = currentUser(req);
  if (section === "openingHours") {
    await db
      .update(openingHoursTable)
      .set({ isClosed: sql`default`, openTime: sql`default`, closeTime: sql`default` });
    invalidateSettings();
    await logActivity(req, "settings_updated", "Opening hours reset to default");
  } else {
    const keys = SECTIONS[section];
    if (!keys) throw new HttpError(400, "Unknown section", "VALIDATION_ERROR");
    await db
      .update(clubSettingsTable)
      .set({
        ...Object.fromEntries(keys.map((k) => [k, sql`default`])),
        updatedAt: new Date(),
        updatedBy: admin.id,
      })
      .where(eq(clubSettingsTable.id, 1));
    invalidateSettings();
    await logActivity(req, "settings_updated", `Settings section "${section}" reset to default`);
  }
  const [settings, hours] = await Promise.all([getSettings(), getOpeningHours()]);
  res.json({ ...settings, openingHours: hours, upcomingBookings: await countUpcomingBookings() });
});

// ─── Admin: weekly opening hours ─────────────────────────────────────────────
router.put("/admin/opening-hours", requireAdmin, async (req, res) => {
  const days = req.body?.days;
  if (!Array.isArray(days) || days.length !== 7)
    throw new HttpError(400, "Send the 7 days of the week", "VALIDATION_ERROR");
  const rows = (days as Body[]).map((d) => {
    const weekday = Number(d?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
      throw new HttpError(400, "Invalid weekday", "VALIDATION_ERROR");
    const isClosed = d?.isClosed === true;
    const openTime = d?.openTime,
      closeTime = d?.closeTime;
    if (!isValidHhmm(openTime) || !isValidCloseHhmm(closeTime))
      throw new HttpError(400, "Times must be HH:MM", "VALIDATION_ERROR", { weekday });
    if (!isClosed && openTime >= closeTime)
      throw new HttpError(400, "Closing time must be after opening time", "VALIDATION_ERROR", {
        weekday,
      });
    return { weekday, isClosed, openTime, closeTime };
  });
  if (new Set(rows.map((r) => r.weekday)).size !== 7)
    throw new HttpError(400, "Each weekday must appear once", "VALIDATION_ERROR");
  await db.transaction(async (tx) => {
    for (const r of rows)
      await tx
        .insert(openingHoursTable)
        .values(r)
        .onConflictDoUpdate({
          target: openingHoursTable.weekday,
          set: { isClosed: r.isClosed, openTime: r.openTime, closeTime: r.closeTime },
        });
  });
  invalidateSettings();
  await logActivity(req, "settings_updated", "Opening hours updated");
  res.json(await getOpeningHours());
});

// ─── Admin: holidays, exceptional hours, maintenance days ────────────────────
router.get("/admin/schedule-exceptions", requireAdmin, async (req, res) => {
  const from = isClubDate(req.query.from)
    ? req.query.from
    : addDays(clubParts(new Date()).date, -7);
  res.json(
    await db.query.scheduleExceptionsTable.findMany({
      where: gte(scheduleExceptionsTable.date, from),
      orderBy: [asc(scheduleExceptionsTable.date)],
      limit: 500,
    }),
  );
});

router.post("/admin/schedule-exceptions", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  if (!isClubDate(b.date)) throw new HttpError(400, "Invalid date", "VALIDATION_ERROR");
  const terrainId =
    b.terrainId == null || b.terrainId === "" ? null : requireId(b.terrainId, "court");
  if (terrainId) {
    const [t] = await db.select().from(terrainsTable).where(eq(terrainsTable.id, terrainId));
    if (!t) throw new HttpError(404, "Court not found", "NOT_FOUND");
  }
  const isClosed = b.isClosed !== false;
  let openTime: string | null = null,
    closeTime: string | null = null;
  if (!isClosed) {
    if (!isValidHhmm(b.openTime) || !isValidCloseHhmm(b.closeTime) || b.openTime >= b.closeTime)
      throw new HttpError(400, "Give valid special opening hours", "VALIDATION_ERROR");
    openTime = b.openTime;
    closeTime = b.closeTime;
  }
  try {
    const [row] = await db
      .insert(scheduleExceptionsTable)
      .values({
        date: b.date,
        terrainId,
        isClosed,
        openTime,
        closeTime,
        reason: cleanText(b.reason, 120),
      })
      .returning();
    await logActivity(
      req,
      "settings_updated",
      `${isClosed ? "Closure" : `Special hours ${openTime}–${closeTime}`} on ${b.date}${terrainId ? ` (court #${terrainId})` : ""}`,
    );
    res.status(201).json(row);
  } catch (err) {
    if (pgCode(err) === "23505")
      throw new HttpError(409, "There is already an exception for that day", "DUPLICATE");
    throw err;
  }
});

router.delete("/admin/schedule-exceptions/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [row] = await db
    .delete(scheduleExceptionsTable)
    .where(eq(scheduleExceptionsTable.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Not found", "NOT_FOUND");
  await logActivity(req, "settings_updated", `Schedule exception of ${row.date} removed`);
  res.status(204).send();
});

// ─── Admin: token packs sold at the desk ─────────────────────────────────────
function packInput(b: Body, creating: boolean) {
  const out: Partial<typeof tokenPackagesTable.$inferInsert> = {};
  if (creating || b?.name !== undefined) {
    const name = cleanText(b?.name, 60);
    if (!name) throw new HttpError(400, "Name is required", "VALIDATION_ERROR");
    out.name = name;
  }
  if (creating || b?.tokens !== undefined) {
    const n = Number(b?.tokens);
    if (!Number.isInteger(n) || n < 1 || n > 1000)
      throw new HttpError(400, "Tokens must be between 1 and 1000", "VALIDATION_ERROR");
    out.tokens = n;
  }
  if (creating || b?.price !== undefined) {
    const price = toMoney(b?.price, 1_000_000);
    if (price === null) throw new HttpError(400, "Invalid price", "VALIDATION_ERROR");
    out.price = price;
  }
  if (typeof b?.isActive === "boolean") out.isActive = b.isActive;
  if (b?.sortOrder !== undefined) {
    const n = Number(b?.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 1000)
      throw new HttpError(400, "Invalid order", "VALIDATION_ERROR");
    out.sortOrder = n;
  }
  return out;
}

router.get("/admin/token-packages", requireAdmin, async (_req, res) => {
  res.json(
    await db
      .select()
      .from(tokenPackagesTable)
      .orderBy(asc(tokenPackagesTable.sortOrder), asc(tokenPackagesTable.tokens)),
  );
});

router.post("/admin/token-packages", requireAdmin, async (req, res) => {
  const [row] = await db
    .insert(tokenPackagesTable)
    .values(packInput(req.body, true) as typeof tokenPackagesTable.$inferInsert)
    .returning();
  await logActivity(
    req,
    "settings_updated",
    `Token pack "${row.name}" created (${row.tokens} tokens, ${row.price})`,
  );
  res.status(201).json(row);
});

router.patch("/admin/token-packages/:id", requireAdmin, async (req, res) => {
  const patch = packInput(req.body, false);
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update", "VALIDATION_ERROR");
  const [row] = await db
    .update(tokenPackagesTable)
    .set(patch)
    .where(eq(tokenPackagesTable.id, requireId(req.params.id)))
    .returning();
  if (!row) throw new HttpError(404, "Not found", "NOT_FOUND");
  await logActivity(
    req,
    "settings_updated",
    `Token pack "${row.name}" updated (${row.tokens} tokens, ${row.price}, ${row.isActive ? "on sale" : "off sale"})`,
  );
  res.json(row);
});

/** A pack already sold stays in the books: it can only be taken off sale. */
router.delete("/admin/token-packages/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const [{ n }] = await db
    .select({ n: count() })
    .from(tokenTransactionsTable)
    .where(eq(tokenTransactionsTable.packageId, id));
  if (Number(n) > 0)
    throw new HttpError(409, "This pack has been sold: deactivate it instead", "PACKAGE_USED");
  const [row] = await db
    .delete(tokenPackagesTable)
    .where(eq(tokenPackagesTable.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Not found", "NOT_FOUND");
  await logActivity(req, "settings_updated", `Token pack "${row.name}" deleted`);
  res.status(204).send();
});

export default router;
