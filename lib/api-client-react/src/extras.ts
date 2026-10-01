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
  pricePerPerson: number;
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
  pricePerPerson: number;
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
