import type { OpeningHoursRow, ScheduleException } from "@workspace/db";
import { clubInstant, clubParts, weekdayOf } from "./club-time";
import { HttpError } from "./http";
import type { ClubSettings } from "./settings";

export const isValidHhmm = (v: unknown): v is string =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** Closing times may be "24:00" (midnight). */
export const isValidCloseHhmm = (v: unknown): v is string => isValidHhmm(v) || v === "24:00";

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export type CourtLike = {
  id: number;
  isActive: boolean;
  isMaintenance: boolean;
  archivedAt: Date | null;
  openingTime: string | null;
  closingTime: string | null;
};

export type DayHours =
  | { closed: true; reason: string | null }
  | { closed: false; open: number; close: number; reason: string | null };

/**
 * Opening hours of one court on one club date. Most specific wins:
 *   court exception  >  club-wide exception  >  court hour override  >  weekly hours.
 * A weekday marked closed stays closed unless an exception opens it.
 */
export function dayHours(
  hours: OpeningHoursRow[],
  exceptions: ScheduleException[],
  court: Pick<CourtLike, "id" | "openingTime" | "closingTime">,
  date: string,
): DayHours {
  const week = hours.find((h) => h.weekday === weekdayOf(date));
  let out: DayHours =
    !week || week.isClosed
      ? { closed: true, reason: null }
      : {
          closed: false,
          open: toMinutes(court.openingTime ?? week.openTime),
          close: toMinutes(court.closingTime ?? week.closeTime),
          reason: null,
        };
  // Only one of the two overrides set: ignore it rather than build a nonsense range
  if (!out.closed && (court.openingTime == null) !== (court.closingTime == null))
    out = { ...out, open: toMinutes(week!.openTime), close: toMinutes(week!.closeTime) };
  const apply = (e: ScheduleException | undefined) => {
    if (!e) return;
    out =
      e.isClosed || !e.openTime || !e.closeTime
        ? { closed: true, reason: e.reason }
        : {
            closed: false,
            open: toMinutes(e.openTime),
            close: toMinutes(e.closeTime),
            reason: e.reason,
          };
  };
  apply(exceptions.find((e) => e.date === date && e.terrainId == null));
  apply(exceptions.find((e) => e.date === date && e.terrainId === court.id));
  return out;
}

/** Start instants of the bookable grid of a day: open, open + d, … while the match ends by closing. */
export function gridStarts(h: DayHours, date: string, durationMinutes: number): Date[] {
  if (h.closed) return [];
  const out: Date[] = [];
  for (let m = h.open; m + durationMinutes <= h.close; m += durationMinutes)
    out.push(clubInstant(date, m));
  return out;
}

export type ScheduleContext = {
  settings: ClubSettings;
  hours: OpeningHoursRow[];
  exceptions: ScheduleException[];
};

/**
 * Throws a clear 4xx unless `start` is a bookable slot of `court`, and returns its end.
 * Checks: court state, opening hours / exceptions of that day, the duration grid,
 * and (for players) the minimum notice and maximum advance from the club settings.
 */
export function assertBookable(
  ctx: ScheduleContext,
  court: CourtLike,
  start: Date,
  opts: { isAdmin: boolean; now?: Date },
): Date {
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Invalid start time", "INVALID_SLOT");
  if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0)
    throw new HttpError(400, "Invalid slot start", "INVALID_SLOT");
  if (!court.isActive || court.archivedAt)
    throw new HttpError(400, "This court is not available", "COURT_UNAVAILABLE");
  if (court.isMaintenance)
    throw new HttpError(400, "This court is under maintenance", "COURT_MAINTENANCE");

  const duration = ctx.settings.bookingDurationMinutes;
  const { date, time } = clubParts(start);
  const h = dayHours(ctx.hours, ctx.exceptions, court, date);
  if (h.closed)
    throw new HttpError(
      400,
      h.reason ? `The club is closed that day (${h.reason})` : "The club is closed that day",
      "CLUB_CLOSED",
    );
  const s = toMinutes(time);
  if (s < h.open || s + duration > h.close)
    throw new HttpError(400, "This court is closed at that time", "OUTSIDE_OPENING_HOURS");
  if ((s - h.open) % duration !== 0) throw new HttpError(400, "Invalid slot start", "INVALID_SLOT");

  if (!opts.isAdmin) {
    const now = (opts.now ?? new Date()).getTime();
    if (start.getTime() <= now)
      throw new HttpError(400, "This slot has already started", "SLOT_IN_PAST");
    if (start.getTime() < now + ctx.settings.minAdvanceMinutes * 60_000)
      throw new HttpError(
        400,
        `Bookings close ${ctx.settings.minAdvanceMinutes} minutes before the match`,
        "TOO_LATE_TO_BOOK",
        { minAdvanceMinutes: ctx.settings.minAdvanceMinutes },
      );
    if (start.getTime() > now + ctx.settings.maxAdvanceDays * 86_400_000)
      throw new HttpError(
        400,
        `Bookings open ${ctx.settings.maxAdvanceDays} days in advance`,
        "TOO_FAR_AHEAD",
        { maxAdvanceDays: ctx.settings.maxAdvanceDays },
      );
  }
  return new Date(start.getTime() + duration * 60_000);
}
