/**
 * Every date and time shown in the app is a club time: a match at 18:30 reads 18:30
 * whatever timezone the visitor's phone is set to. All formatting and all "which day
 * is it" questions go through this module; date-fns is only used for relative
 * durations ("in 2 hours"), which don't depend on a timezone.
 */
export const CLUB_TZ = (import.meta.env.VITE_CLUB_TIMEZONE as string | undefined) || "Africa/Tunis";

type DateInput = string | Date;

const LOCALES: Record<string, string> = { fr: "fr-FR", en: "en-GB", ar: "ar-TN" };

/** The date layouts the app uses, by name. */
const FORMATS = {
  /** vendredi 2 octobre */
  long: { weekday: "long", day: "numeric", month: "long" },
  /** vendredi 2 octobre 2026 */
  longYear: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  /** ven. 2 oct. */
  short: { weekday: "short", day: "numeric", month: "short" },
  /** ven. 2 oct. 2026 */
  shortYear: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  /** 2 oct. 2026 */
  date: { day: "numeric", month: "short", year: "numeric" },
  /** 2 octobre 2026 */
  dateLong: { day: "numeric", month: "long", year: "numeric" },
  /** 2 oct. */
  dayMonth: { day: "numeric", month: "short" },
  /** 2 octobre */
  dayMonthLong: { day: "numeric", month: "long" },
  /** 02/10 */
  numeric: { day: "2-digit", month: "2-digit" },
  /** vendredi */
  weekday: { weekday: "long" },
  /** ven. */
  weekdayShort: { weekday: "short" },
  /** ven. 2 */
  weekdayDay: { weekday: "short", day: "numeric" },
  /** oct. */
  month: { month: "short" },
  /** 2 */
  day: { day: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type ClubDateFormat = keyof typeof FORMATS | Intl.DateTimeFormatOptions;

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

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(lang: string, format: ClubDateFormat, timeZone: string) {
  const options = typeof format === "string" ? FORMATS[format] : format;
  const key = `${lang}|${timeZone}|${typeof format === "string" ? format : JSON.stringify(format)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang] ?? LOCALES.fr, { timeZone, ...options });
    formatters.set(key, f);
  }
  return f;
}

/**
 * Dates are shown standing alone (headings, cards, rows), so they start with a capital:
 * "Vendredi 2 octobre". Only the first letter: CSS `capitalize` would also raise the month.
 */
const capFirst = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

// ─── Instants → club time ────────────────────────────────────────────────────

/** "18:30" in club time. */
export const clubTime = (d: DateInput) => hm.format(new Date(d));

/** "2026-10-02": the club day an instant falls on. */
export const clubDay = (d: DateInput) => ymd.format(new Date(d));

/** Minutes since the club's midnight (18:30 → 1110). */
export function clubMinutes(d: DateInput) {
  const [h, m] = clubTime(d).split(":").map(Number);
  return h * 60 + m;
}

/** Club date in the UI language ("Vendredi 2 octobre" by default). */
export const clubDate = (d: DateInput, lang: string, format: ClubDateFormat = "long") =>
  capFirst(formatter(lang, format, CLUB_TZ).format(new Date(d)));

/** Club date and time: "2 oct. 2026 · 18:30". */
export const clubDateTime = (d: DateInput, lang: string, format: ClubDateFormat = "date") =>
  `${clubDate(d, lang, format)} · ${clubTime(d)}`;

// ─── Club days ("2026-10-02") ────────────────────────────────────────────────

/** Today's club day. */
export const clubToday = () => clubDay(new Date());

/** A club day shifted by n days (pure calendar arithmetic). */
export function addClubDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The next `count` club days, starting today. */
export const clubDays = (count: number) =>
  Array.from({ length: count }, (_, i) => addClubDays(clubToday(), i));

/** A club day in words ("ven. 2 oct."). Also formats date-only values from the API. */
export const clubDayLabel = (day: string, lang: string, format: ClubDateFormat = "long") =>
  capFirst(formatter(lang, format, "UTC").format(new Date(`${day.slice(0, 10)}T12:00:00Z`)));

// ─── Club wall-clock time → instants (forms) ─────────────────────────────────

/** Offset of the club timezone from UTC at an instant, in ms (handles DST). */
function offsetMs(at: Date) {
  const [y, mo, d] = clubDay(at).split("-").map(Number);
  const [h, mi] = clubTime(at).split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** The instant at which the club's clock shows `day` ("2026-10-02") at `time` ("18:30"). */
export function clubInstant(day: string, time: string): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetMs(new Date(wall));
  return new Date(wall - offsetMs(new Date(first)));
}

/** Value of an <input type="datetime-local"> showing an instant in club time. */
export const toClubInput = (d?: DateInput | null) => (d ? `${clubDay(d)}T${clubTime(d)}` : "");

/** ISO instant of an <input type="datetime-local"> value typed in club time. */
export function fromClubInput(value: string) {
  const [day, time] = value.split("T");
  return clubInstant(day, time.slice(0, 5)).toISOString();
}
