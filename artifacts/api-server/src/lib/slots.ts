import { clubParts } from "./club-time";
import { HttpError } from "./http";

export const SLOT_MINUTES = 90;
export const SLOT_MS = SLOT_MINUTES * 60 * 1000;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * A booking must start on the court's 90-minute grid (opening time + n × 90 min,
 * club-local time) and end before closing. This is the same grid the calendar shows,
 * so nobody can book 18:47 and straddle two slots.
 */
export function assertOnGrid(
  terrain: { openingTime: string; closingTime: string },
  start: Date,
): void {
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Invalid start time", "INVALID_SLOT");
  if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0)
    throw new HttpError(400, "Invalid slot start", "INVALID_SLOT");
  const s = minutes(clubParts(start).time);
  const open = minutes(terrain.openingTime);
  const close = minutes(terrain.closingTime);
  if (s < open || s + SLOT_MINUTES > close)
    throw new HttpError(400, "This court is closed at that time", "OUTSIDE_OPENING_HOURS");
  if ((s - open) % SLOT_MINUTES !== 0)
    throw new HttpError(400, "Invalid slot start", "INVALID_SLOT");
}

export const isValidHhmm = (v: unknown): v is string =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
