import { useClubRulesQuery, type ClubRules } from "@workspace/api-client-react";

/**
 * Placeholder while /settings loads (same values as the database defaults). The
 * API decides every price and rule when booking; these only fill the first paint.
 */
const LOADING: ClubRules = {
  bookingDurationMinutes: 90,
  minPlayers: 1,
  maxPlayers: 4,
  minAdvanceMinutes: 30,
  maxAdvanceDays: 14,
  cancellationNoticeHours: 0,
  lateCancellation: "forbid",
  currency: "TND",
  playerPrice: 25,
  fullCourtPrice: 100,
  tokenCostPlayer: 1,
  tokenCostFullCourt: 4,
  tokenUnitPrice: 25,
  tokenMinPurchase: 1,
  openMatchesEnabled: true,
  invitationsEnabled: true,
  cashPaymentEnabled: true,
  openingHours: [],
  tokenPackages: [],
};

/** "08:00 – 23:00" from the weekly hours, and whether the club opens every day. */
function hoursSummary(days: ClubRules["openingHours"]) {
  const open = days.filter((d) => !d.isClosed);
  if (!open.length) return { hoursLabel: "", openEveryDay: false };
  const first = open.map((d) => d.openTime).sort()[0];
  const last = open
    .map((d) => d.closeTime)
    .sort()
    .at(-1)!;
  return { hoursLabel: `${first} – ${last}`, openEveryDay: open.length === 7 };
}

/** First and last hour the club is open in a week (hour rows of the admin grids). */
export function openingHourBounds(days: ClubRules["openingHours"]) {
  const open = days.filter((d) => !d.isClosed);
  if (!open.length) return { firstHour: 8, lastHour: 24 };
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const firstHour = Math.floor(Math.min(...open.map((d) => minutes(d.openTime))) / 60);
  const lastHour = Math.ceil(Math.max(...open.map((d) => minutes(d.closeTime))) / 60);
  return { firstHour, lastHour: Math.max(lastHour, firstHour + 1) };
}

/** The club's operational rules (admin → Réglages), shared by every screen. */
export function useClubRules() {
  const { data, isLoading } = useClubRulesQuery();
  const rules = data ?? LOADING;
  return { ...rules, ...hoursSummary(rules.openingHours), isLoading };
}
export type ClubRulesView = ReturnType<typeof useClubRules>;
