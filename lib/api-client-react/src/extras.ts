/**
 * Hand-written client for endpoints added after the generated client
 * (pricing, equipment, recurring series, web push, notification preferences).
 * Kept outside ./generated so `orval` codegen never overwrites it.
 * The same endpoints are documented in lib/api-spec/openapi.yaml.
 */
import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

// ─── Types ───────────────────────────────────────────────────────────────────

/** Extra fields the calendar API now returns on every slot. */
export type SlotPricing = {
  tokensPerSpot: number;
  tokensFullCourt: number;
  pricePerPerson: number;
  fullCourtPrice: number;
  /** This viewer may book it now (inside the club's booking window, court open). */
  bookable?: boolean;
  isPeak: boolean;
  priceLabel: string | null;
  seriesId?: number | null;
};

export type PricingRule = {
  id: number;
  name: string;
  terrainId: number | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  tokensPerSpot: number;
  pricePerPerson: number | null;
  isPeak: boolean;
  priority: number;
  isActive: boolean;
  createdAt: string;
};
export type PricingRuleInput = Partial<Omit<PricingRule, "id" | "createdAt">>;
export type PriceQuote = {
  tokensPerSpot: number;
  tokensFullCourt: number;
  pricePerPerson: number;
  fullCourtPrice: number;
  isPeak: boolean;
  ruleId: number | null;
  ruleName: string | null;
  fullCourtTokens: number;
};

export type EquipmentItem = {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
  available: number;
  createdAt: string;
};
export type EquipmentInput = Partial<
  Pick<EquipmentItem, "name" | "description" | "category" | "price" | "stock" | "isActive">
>;
export type EquipmentLine = { itemId: number; quantity: number };
export type RentalStatus = "reserved" | "handed_out" | "returned" | "cancelled";
export type Rental = {
  id: number;
  quantity: number;
  unitPrice: number;
  status: RentalStatus;
  item: { id: number; name: string; category: string };
  player: string | null;
  reservation: {
    id: number;
    startTime: string;
    endTime: string;
    terrainName: string;
    guestName: string | null;
  };
};

export type SeriesInput = {
  terrainId: number;
  firstStart: string;
  occurrences: number;
  intervalWeeks?: number;
  userId?: number;
  guestName?: string;
  guestPhone?: string;
  label?: string;
  notes?: string;
  skipConflicts?: boolean;
};
export type SeriesPreview = {
  dates: { startTime: string; conflict: boolean; conflictWith: string | null }[];
};
export type SeriesCreated = { series: { id: number }; created: string[]; skipped: string[] };
export type SeriesSummary = {
  id: number;
  label: string | null;
  terrain: { id: number; name: string } | null;
  who: string | null;
  guestPhone: string | null;
  firstStart: string;
  occurrences: number;
  intervalWeeks: number;
  remaining: number;
  nextStart: string | null;
};

export type NotificationPrefs = { emailNotifications?: boolean; pushNotifications?: boolean };

// ─── Query keys ──────────────────────────────────────────────────────────────

export const extrasKeys = {
  pricingRules: ["/api/pricing/rules"] as const,
  adminPricingRules: ["/api/admin/pricing/rules"] as const,
  quote: (terrainId: number, startTime: string) =>
    ["/api/pricing/quote", terrainId, startTime] as const,
  equipment: (startTime?: string) => ["/api/equipment", startTime ?? null] as const,
  adminEquipment: ["/api/admin/equipment"] as const,
  rentals: (date: string) => ["/api/admin/equipment/rentals", date] as const,
  series: ["/api/admin/series"] as const,
  pushKey: ["/api/push/public-key"] as const,
};

type Opts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const usePricingRules = (o?: Opts<PricingRule[]>) =>
  useQuery({
    queryKey: extrasKeys.pricingRules,
    queryFn: () => customFetch<PricingRule[]>("/api/pricing/rules"),
    staleTime: 5 * 60_000,
    ...o,
  });
export const useAdminPricingRules = (o?: Opts<PricingRule[]>) =>
  useQuery({
    queryKey: extrasKeys.adminPricingRules,
    queryFn: () => customFetch<PricingRule[]>("/api/admin/pricing/rules"),
    ...o,
  });
export const usePriceQuote = (
  terrainId: number | null,
  startTime: string | null,
  o?: Opts<PriceQuote>,
) =>
  useQuery({
    queryKey: extrasKeys.quote(terrainId ?? 0, startTime ?? ""),
    queryFn: () =>
      customFetch<PriceQuote>(
        `/api/pricing/quote?terrainId=${terrainId}&startTime=${encodeURIComponent(startTime!)}`,
      ),
    enabled: !!terrainId && !!startTime,
    ...o,
  });
export const useCreatePricingRule = () =>
  useMutation({
    mutationFn: (data: PricingRuleInput) =>
      customFetch<PricingRule>("/api/admin/pricing/rules", { method: "POST", ...json(data) }),
  });
export const useUpdatePricingRule = () =>
  useMutation({
    mutationFn: ({ id, data }: { id: number; data: PricingRuleInput }) =>
      customFetch<PricingRule>(`/api/admin/pricing/rules/${id}`, {
        method: "PATCH",
        ...json(data),
      }),
  });
export const useDeletePricingRule = () =>
  useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/admin/pricing/rules/${id}`, { method: "DELETE" }),
  });

// ─── Equipment ───────────────────────────────────────────────────────────────

export const useEquipment = (startTime?: string | null, o?: Opts<EquipmentItem[]>) =>
  useQuery({
    queryKey: extrasKeys.equipment(startTime ?? undefined),
    queryFn: () =>
      customFetch<EquipmentItem[]>(
        `/api/equipment${startTime ? `?startTime=${encodeURIComponent(startTime)}` : ""}`,
      ),
    staleTime: 30_000,
    ...o,
  });
export const useAdminEquipment = (o?: Opts<EquipmentItem[]>) =>
  useQuery({
    queryKey: extrasKeys.adminEquipment,
    queryFn: () => customFetch<EquipmentItem[]>("/api/admin/equipment"),
    ...o,
  });
export const useRentals = (date: string, o?: Opts<Rental[]>) =>
  useQuery({
    queryKey: extrasKeys.rentals(date),
    queryFn: () => customFetch<Rental[]>(`/api/admin/equipment/rentals?date=${date}`),
    refetchInterval: 60_000,
    ...o,
  });
export const useCreateEquipment = () =>
  useMutation({
    mutationFn: (data: EquipmentInput) =>
      customFetch<EquipmentItem>("/api/admin/equipment", { method: "POST", ...json(data) }),
  });
export const useUpdateEquipment = () =>
  useMutation({
    mutationFn: ({ id, data }: { id: number; data: EquipmentInput }) =>
      customFetch<EquipmentItem>(`/api/admin/equipment/${id}`, { method: "PATCH", ...json(data) }),
  });
export const useDeleteEquipment = () =>
  useMutation({
    mutationFn: (id: number) =>
      customFetch<{ archived?: boolean } | void>(`/api/admin/equipment/${id}`, {
        method: "DELETE",
      }),
  });
export const useUpdateRental = () =>
  useMutation({
    mutationFn: ({ id, status }: { id: number; status: RentalStatus }) =>
      customFetch<unknown>(`/api/admin/equipment/rentals/${id}`, {
        method: "PATCH",
        ...json({ status }),
      }),
  });
export const useAddReservationEquipment = () =>
  useMutation({
    mutationFn: ({ id, items }: { id: number; items: EquipmentLine[] }) =>
      customFetch<{ items: unknown[] }>(`/api/reservations/${id}/equipment`, {
        method: "POST",
        ...json({ items }),
      }),
  });

// ─── Recurring bookings ──────────────────────────────────────────────────────

export const useSeries = (o?: Opts<SeriesSummary[]>) =>
  useQuery({
    queryKey: extrasKeys.series,
    queryFn: () => customFetch<SeriesSummary[]>("/api/admin/series"),
    ...o,
  });
export const usePreviewSeries = () =>
  useMutation({
    mutationFn: (data: SeriesInput) =>
      customFetch<SeriesPreview>("/api/admin/series/preview", { method: "POST", ...json(data) }),
  });
export const useCreateSeries = () =>
  useMutation({
    mutationFn: (data: SeriesInput) =>
      customFetch<SeriesCreated>("/api/admin/series", { method: "POST", ...json(data) }),
  });
export const useCancelSeries = () =>
  useMutation({
    mutationFn: (id: number) =>
      customFetch<{ cancelled: number }>(`/api/admin/series/${id}/cancel`, { method: "POST" }),
  });

// ─── Web push & preferences ──────────────────────────────────────────────────

export const usePushPublicKey = () =>
  useQuery({
    queryKey: extrasKeys.pushKey,
    queryFn: () =>
      customFetch<{ enabled: boolean; publicKey: string | null }>("/api/push/public-key"),
    staleTime: Infinity,
  });
export const pushSubscribe = (sub: PushSubscriptionJSON) =>
  customFetch<{ ok: boolean }>("/api/push/subscribe", { method: "POST", ...json(sub) });
export const pushUnsubscribe = (endpoint: string) =>
  customFetch<{ ok: boolean }>("/api/push/unsubscribe", { method: "POST", ...json({ endpoint }) });
export const pushTest = () => customFetch<{ sent: number }>("/api/push/test", { method: "POST" });
export const useUpdateNotificationPrefs = () =>
  useMutation({
    mutationFn: (data: NotificationPrefs) =>
      customFetch<unknown>("/api/users/me", { method: "PATCH", ...json(data) }),
  });

/** Body extension for booking / joining with rental equipment. */
export type WithEquipment = { equipment?: EquipmentLine[] };

// ─── Match management (admin desk) ───────────────────────────────────────────

export type AddPlayerInput = {
  reservationId: number;
  userId: number;
  /** cash_club (default): pays at the desk · token: debits the member's wallet */
  paymentType?: "cash_club" | "token";
  paymentStatus?: "paid" | "pending";
};
export const useAddPlayer = () =>
  useMutation({
    mutationFn: ({ reservationId, ...body }: AddPlayerInput) =>
      customFetch<unknown>(`/api/reservations/${reservationId}/players`, {
        method: "POST",
        ...json(body),
      }),
  });
export const useRemovePlayer = () =>
  useMutation({
    mutationFn: ({ reservationId, playerId }: { reservationId: number; playerId: number }) =>
      customFetch<{ refunded: number }>(`/api/reservations/${reservationId}/players/${playerId}`, {
        method: "DELETE",
      }),
  });
export const useBlockSlot = () =>
  useMutation({
    mutationFn: (data: { terrainId: number; startTime: string; reason?: string }) =>
      customFetch<unknown>("/api/admin/slots/block", { method: "POST", ...json(data) }),
  });

/** Admin booking on behalf of a member (token or cash at the desk) or a phone/walk-in guest. */
export type AdminBookingInput = {
  terrainId: number;
  startTime: string;
  bookingMode: "full_court" | "own_spot";
  userId?: number;
  paymentMethod?: "token" | "cash_club";
  guestName?: string;
  guestPhone?: string;
  bookingType?: "phone" | "manual" | "online";
  notes?: string;
  isPublic?: boolean;
  publicDescription?: string;
  equipment?: EquipmentLine[];
};

// ─── Members (admin) ─────────────────────────────────────────────────────────

export type AdminUserUpdate = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role?: "admin" | "player";
};
export const useAdminUpdateUser = () =>
  useMutation({
    mutationFn: ({ id, data }: { id: number; data: AdminUserUpdate }) =>
      customFetch<unknown>(`/api/users/${id}`, { method: "PATCH", ...json(data) }),
  });

// ─── Tournaments ─────────────────────────────────────────────────────────────

export const useUnregisterTournament = () =>
  useMutation({
    mutationFn: (id: number) =>
      customFetch<unknown>(`/api/tournaments/${id}/register`, { method: "DELETE" }),
  });

// ─── Club settings (operational rules, edited in Admin → Réglages) ────────────

export type OpeningHoursDay = {
  weekday: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
};
export type TokenPackage = {
  id: number;
  name: string;
  tokens: number;
  price: number;
  isActive?: boolean;
  sortOrder?: number;
};
/** Public rules every screen uses (GET /settings). */
export type ClubRules = {
  bookingDurationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  cancellationNoticeHours: number;
  lateCancellation: "forbid" | "no_refund";
  currency: string;
  playerPrice: number;
  fullCourtPrice: number;
  tokenCostPlayer: number;
  tokenCostFullCourt: number;
  tokenUnitPrice: number;
  tokenMinPurchase: number;
  openMatchesEnabled: boolean;
  invitationsEnabled: boolean;
  cashPaymentEnabled: boolean;
  openingHours: OpeningHoursDay[];
  tokenPackages: TokenPackage[];
};
export type AdminSettings = Omit<ClubRules, "tokenPackages"> & {
  bookingConfirmationNotificationsEnabled: boolean;
  remindersEnabled: boolean;
  reminderLeadMinutes: number;
  cancellationNotificationsEnabled: boolean;
  invitationNotificationsEnabled: boolean;
  tokenNotificationsEnabled: boolean;
  matchFinishedNotificationsEnabled: boolean;
  updatedAt: string;
  updatedBy: number | null;
  upcomingBookings: number;
};
export type SettingsPatch = Partial<
  Omit<AdminSettings, "openingHours" | "updatedAt" | "updatedBy" | "upcomingBookings">
>;
export type SettingsSection =
  | "booking"
  | "pricing"
  | "tokens"
  | "features"
  | "notifications"
  | "openingHours";
export type ScheduleException = {
  id: number;
  date: string;
  terrainId: number | null;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
};
export type ScheduleExceptionInput = Omit<ScheduleException, "id">;

export const settingsKeys = {
  rules: ["/api/settings"] as const,
  admin: ["/api/admin/settings"] as const,
  exceptions: ["/api/admin/schedule-exceptions"] as const,
  packages: ["/api/admin/token-packages"] as const,
  myInvites: ["/api/invites"] as const,
  members: (q: string) => ["/api/members/search", q] as const,
};

export const useClubRulesQuery = (o?: Opts<ClubRules>) =>
  useQuery({
    queryKey: settingsKeys.rules,
    queryFn: () => customFetch<ClubRules>("/api/settings"),
    staleTime: 30_000,
    ...o,
  });
export const useAdminSettings = (o?: Opts<AdminSettings>) =>
  useQuery({
    queryKey: settingsKeys.admin,
    queryFn: () => customFetch<AdminSettings>("/api/admin/settings"),
    ...o,
  });
export const useUpdateSettings = () =>
  useMutation({
    mutationFn: (data: SettingsPatch) =>
      customFetch<AdminSettings>("/api/admin/settings", { method: "PATCH", ...json(data) }),
  });
export const useResetSettings = () =>
  useMutation({
    mutationFn: (section: SettingsSection) =>
      customFetch<AdminSettings>("/api/admin/settings/reset", {
        method: "POST",
        ...json({ section }),
      }),
  });
export const useSaveOpeningHours = () =>
  useMutation({
    mutationFn: (days: OpeningHoursDay[]) =>
      customFetch<OpeningHoursDay[]>("/api/admin/opening-hours", {
        method: "PUT",
        ...json({ days }),
      }),
  });
export const useScheduleExceptions = (o?: Opts<ScheduleException[]>) =>
  useQuery({
    queryKey: settingsKeys.exceptions,
    queryFn: () => customFetch<ScheduleException[]>("/api/admin/schedule-exceptions"),
    ...o,
  });
export const useCreateScheduleException = () =>
  useMutation({
    mutationFn: (data: ScheduleExceptionInput) =>
      customFetch<ScheduleException>("/api/admin/schedule-exceptions", {
        method: "POST",
        ...json(data),
      }),
  });
export const useDeleteScheduleException = () =>
  useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/admin/schedule-exceptions/${id}`, { method: "DELETE" }),
  });
export const useAdminTokenPackages = (o?: Opts<TokenPackage[]>) =>
  useQuery({
    queryKey: settingsKeys.packages,
    queryFn: () => customFetch<TokenPackage[]>("/api/admin/token-packages"),
    ...o,
  });
export const useSaveTokenPackage = () =>
  useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Partial<TokenPackage> }) =>
      id
        ? customFetch<TokenPackage>(`/api/admin/token-packages/${id}`, {
            method: "PATCH",
            ...json(data),
          })
        : customFetch<TokenPackage>("/api/admin/token-packages", { method: "POST", ...json(data) }),
  });
export const useDeleteTokenPackage = () =>
  useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/admin/token-packages/${id}`, { method: "DELETE" }),
  });

// ─── Courts (admin) ──────────────────────────────────────────────────────────

export const useArchivedTerrains = <T = unknown>(o?: Opts<T[]>) =>
  useQuery({
    queryKey: ["/api/terrains", "archived"] as const,
    queryFn: () => customFetch<T[]>("/api/terrains?archived=true"),
    ...o,
  });
export const useArchiveTerrain = () =>
  useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      customFetch<unknown>(`/api/terrains/${id}/${archived ? "archive" : "unarchive"}`, {
        method: "POST",
      }),
  });
export const useReorderTerrains = () =>
  useMutation({
    mutationFn: (ids: number[]) =>
      customFetch<unknown>("/api/terrains/order", { method: "PUT", ...json({ ids }) }),
  });

// ─── Personal invitations ────────────────────────────────────────────────────

export type MyInvite = {
  id: number;
  token: string;
  invitedBy: string;
  createdAt: string;
  reservation: {
    id: number;
    terrainName: string;
    startTime: string;
    endTime: string;
    bookingMode: "full_court" | "own_spot";
    totalSpots: number;
    filledSpots: number;
    free: boolean;
  };
};
export type MemberHit = { id: number; name: string };

export const useMyInvites = (o?: Opts<MyInvite[]>) =>
  useQuery({
    queryKey: settingsKeys.myInvites,
    queryFn: () => customFetch<MyInvite[]>("/api/invites"),
    refetchInterval: 60_000,
    ...o,
  });
export const useDeclineInvite = () =>
  useMutation({
    mutationFn: (token: string) =>
      customFetch<unknown>(`/api/invites/${token}/decline`, { method: "POST" }),
  });
export const useMemberSearch = (q: string, o?: Opts<MemberHit[]>) =>
  useQuery({
    queryKey: settingsKeys.members(q),
    queryFn: () => customFetch<MemberHit[]>(`/api/members/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
    ...o,
  });
export const useInviteMember = () =>
  useMutation({
    mutationFn: ({ reservationId, userId }: { reservationId: number; userId: number }) =>
      customFetch<{ invitedUser: MemberHit }>(`/api/reservations/${reservationId}/invite`, {
        method: "POST",
        ...json({ userId }),
      }),
  });

/** Human message from any API error ({ error: "..." } body), or the fallback. */
export function apiErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { data?: unknown })?.data;
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string")
    return (data as { error: string }).error;
  return fallback;
}
/** Machine code from an API error ({ code: "SLOT_TAKEN" }), if any. */
export function apiErrorCode(e: unknown): string | undefined {
  const data = (e as { data?: unknown })?.data;
  return data && typeof data === "object"
    ? ((data as { code?: string }).code ?? undefined)
    : undefined;
}
