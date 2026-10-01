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
