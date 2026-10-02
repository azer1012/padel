import { env } from "../config/env";

/** Wall-clock parts of an instant in the club's timezone (default Africa/Tunis). */
export function clubParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: env.clubTimezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    weekday,
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Offset of the club timezone from UTC at an instant, in ms (handles DST). */
function offsetMs(at: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: env.clubTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the club's clock shows `date` (YYYY-MM-DD) + `minutes` after midnight. */
export function clubInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  const first = wall - offsetMs(new Date(wall));
  return new Date(wall - offsetMs(new Date(first)));
}

/** YYYY-MM-DD shifted by n days (pure calendar arithmetic). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const isClubDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Weekday (0 = Sunday) of a YYYY-MM-DD date. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

const LOCALES = { fr: "fr-FR", en: "en-GB", ar: "ar-TN" } as const;
export type Lang = keyof typeof LOCALES;

export function formatClubDate(date: Date, lang: Lang = "fr") {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: env.clubTimezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatClubTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: env.clubTimezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * "03/10/2026 18:30": a date the three interface languages read the same way. Used
 * in texts stored once and shown to everyone (token ledger entries).
 */
export function formatClubStamp(date: Date) {
  const { date: day, time } = clubParts(date);
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y} ${time}`;
}
