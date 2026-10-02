import {
  db,
  clubSettingsTable,
  openingHoursTable,
  scheduleExceptionsTable,
  type ClubSettingsRow,
  type OpeningHoursRow,
  type ScheduleException,
} from "@workspace/db";
import { and, asc, gte, lte } from "drizzle-orm";

export type ClubSettings = ClubSettingsRow;

/**
 * Settings change a few times a year but are read on every booking, so they are
 * cached in-process. An admin save invalidates the cache of the instance that
 * handled it; other instances (if you scale out) pick it up within TTL_MS.
 */
const TTL_MS = 10_000;
let cached: {
  at: number;
  value: Promise<{ settings: ClubSettings; hours: OpeningHoursRow[] }>;
} | null = null;

async function load() {
  let [settings] = await db.select().from(clubSettingsTable).limit(1);
  if (!settings) {
    // Row deleted by hand: recreate it with the defaults rather than failing every booking.
    await db.insert(clubSettingsTable).values({ id: 1 }).onConflictDoNothing();
    [settings] = await db.select().from(clubSettingsTable).limit(1);
  }
  const hours = await db.select().from(openingHoursTable).orderBy(asc(openingHoursTable.weekday));
  return { settings, hours };
}

function snapshot() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const value = load();
    cached = { at: Date.now(), value };
    value.catch(() => {
      if (cached?.value === value) cached = null;
    });
  }
  return cached.value;
}

export const getSettings = async () => (await snapshot()).settings;
export const getOpeningHours = async () => (await snapshot()).hours;
export function invalidateSettings() {
  cached = null;
}

/** Exceptions (holidays, special hours, maintenance days) for club dates [from, to]. */
export async function loadExceptions(from: string, to: string): Promise<ScheduleException[]> {
  return db
    .select()
    .from(scheduleExceptionsTable)
    .where(and(gte(scheduleExceptionsTable.date, from), lte(scheduleExceptionsTable.date, to)));
}

/** What any visitor may know about the club rules (no audit fields). */
export function publicSettings(s: ClubSettings, hours: OpeningHoursRow[]) {
  return {
    bookingDurationMinutes: s.bookingDurationMinutes,
    minPlayers: s.minPlayers,
    maxPlayers: s.maxPlayers,
    minAdvanceMinutes: s.minAdvanceMinutes,
    maxAdvanceDays: s.maxAdvanceDays,
    cancellationNoticeHours: s.cancellationNoticeHours,
    lateCancellation: s.lateCancellation,
    currency: s.currency,
    playerPrice: s.playerPrice,
    fullCourtPrice: s.fullCourtPrice,
    tokenCostPlayer: s.tokenCostPlayer,
    tokenCostFullCourt: s.tokenCostFullCourt,
    tokenUnitPrice: s.tokenUnitPrice,
    tokenMinPurchase: s.tokenMinPurchase,
    openMatchesEnabled: s.openMatchesEnabled,
    invitationsEnabled: s.invitationsEnabled,
    cashPaymentEnabled: s.cashPaymentEnabled,
    shopEnabled: s.shopEnabled,
    openingHours: hours.map((h) => ({
      weekday: h.weekday,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
    })),
  };
}

/** Settings + weekly hours + the exceptions of club dates [from, to]: all a booking check needs. */
export async function scheduleContext(from: string, to: string) {
  const [{ settings, hours }, exceptions] = await Promise.all([
    snapshot(),
    loadExceptions(from, to),
  ]);
  return { settings, hours, exceptions };
}
