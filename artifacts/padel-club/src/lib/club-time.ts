/**
 * Match times are club times: always shown in the club's timezone (Africa/Tunis by
 * default), whatever timezone the visitor's phone is set to.
 */
export const CLUB_TZ = (import.meta.env.VITE_CLUB_TIMEZONE as string | undefined) || "Africa/Tunis";

const hm = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "18:30" in club time. */
export const clubTime = (d: string | Date) => hm.format(new Date(d));
/** "2026-10-02" in club time. */
export const clubDay = (d: string | Date) => ymd.format(new Date(d));

/** Long club-time date in the UI language ("vendredi 2 octobre"). */
export function clubDate(
  d: string | Date,
  lang: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
) {
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";
  return new Intl.DateTimeFormat(locale, { timeZone: CLUB_TZ, ...opts }).format(new Date(d));
}

/** Calendar days starting today (club time), as Date objects at local noon of that club day. */
export function clubDays(count: number) {
  const [y, m, d] = clubDay(new Date()).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(y, m - 1, d + i, 12));
}
