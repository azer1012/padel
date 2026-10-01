import { useState } from "react";
import { format } from "date-fns";
import {
  useListReservations,
  useCancelReservation,
  useCreateReservation,
  useListTerrains,
  useGetMe,
  getListReservationsQueryKey,
  getCalendarQueryKey,
  useGetCalendar,
} from "@workspace/api-client-react";
import type { Reservation, User } from "@workspace/api-client-react";
import { MemberPicker } from "@/components/smash/member-picker";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid, List, X, CalendarDays, Phone, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CourtCalendar from "@/components/court-calendar";
import { SeriesDialog } from "@/components/smash/series-dialog";
import { useSeries, useCancelSeries, extrasKeys } from "@workspace/api-client-react";
import { Avatar, Page, PageHeader } from "@/components/smash/primitives";
import {
  DataTable,
  Field,
  Pagination,
  Pill,
  Segmented,
  Toolbar,
  displayName,
  useConfirm,
  type Column,
  type Tone,
} from "@/components/smash/admin";
import { useToast } from "@/hooks/use-toast";
import { useTx, useDateLocale } from "@/lib/i18n";
import { clubTime } from "@/lib/club-time";
import { useClubRules } from "@/hooks/use-club-rules";

const PAGE = 20;
type BookingType = "manual" | "phone" | "online";
const emptyBooking = {
  terrainId: "",
  date: format(new Date(), "yyyy-MM-dd"),
  time: "",
  member: null as User | null,
  paymentMethod: "cash_club" as "cash_club" | "token",
  bookingMode: "full_court" as "full_court" | "own_spot",
  guestName: "",
  guestPhone: "",
  bookingType: "phone" as BookingType,
  notes: "",
};

export default function AdminReservations() {
  const tx = useTx();
  const locale = useDateLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data: me } = useGetMe();

  const [view, setView] = useState<"calendar" | "list" | "series">("calendar");
  const [seriesOpen, setSeriesOpen] = useState(false);
  const { data: series, isLoading: loadingSeries } = useSeries({
    enabled: view === "series",
  } as any);
  const cancelSeries = useCancelSeries();
  const [date, setDate] = useState("");
  const [terrainFilter, setTerrainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [nb, setNb] = useState(emptyBooking);
  const rules = useClubRules();
  // Free slots of the chosen court and day, from the API (duration, hours, holidays, bookings)
  const { data: dayCal, isFetching: loadingSlots } = useGetCalendar(
    { date: nb.date, terrainIds: nb.terrainId },
    { query: { enabled: createOpen && !!nb.date && !!nb.terrainId } as any },
  );
  const freeSlots = (dayCal?.terrains[0]?.slots ?? []).filter(
    (s) => s.status === "available" && s.bookable !== false,
  );

  const params: Record<string, any> = { page, limit: PAGE };
  if (date) params.date = date;
  if (terrainFilter !== "all") params.terrainId = parseInt(terrainFilter);
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, isLoading } = useListReservations(params, {
    query: { queryKey: getListReservationsQueryKey(params), enabled: view === "list" },
  });
  const { data: terrains } = useListTerrains();
  const cancelMutation = useCancelReservation();
  const createMutation = useCreateReservation();

  const refresh = (startTime?: string) => {
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    if (startTime)
      qc.invalidateQueries({
        queryKey: getCalendarQueryKey({ date: format(new Date(startTime), "yyyy-MM-dd") }),
      });
  };

  async function handleCancel(r: Reservation) {
    const ok = await confirm({
      title: tx({
        fr: "Annuler cette réservation ?",
        en: "Cancel this booking?",
        ar: "إلغاء هذا الحجز؟",
      }),
      description: `${r.terrain?.name ?? ""}, ${format(new Date(r.startTime), "EEEE d MMMM · HH:mm", { locale })}. ${tx({ fr: "Les tokens des joueurs seront remboursés.", en: "Players' tokens will be refunded.", ar: "سيتم إرجاع رصيد اللاعبين." })}`,
      confirmLabel: tx({ fr: "Oui, annuler", en: "Yes, cancel", ar: "نعم، ألغِ" }),
      destructive: true,
    });
    if (!ok) return;
    cancelMutation.mutate(
      { id: r.id },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Réservation annulée", en: "Booking cancelled", ar: "تم إلغاء الحجز" }),
          });
          refresh(r.startTime);
        },
        onError: (e: any) =>
          toast({
            title: tx({ fr: "Annulation impossible", en: "Couldn't cancel", ar: "تعذر الإلغاء" }),
            description: e?.data?.error,
            variant: "destructive",
          }),
      },
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    // nb.time holds the slot's exact start instant from the calendar API
    const startTime = nb.time;
    if (!nb.terrainId || !startTime) {
      toast({
        title: tx({
          fr: "Choisissez un terrain et une heure",
          en: "Pick a court and a time",
          ar: "اختر ملعبًا ووقتًا",
        }),
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(
      {
        data: {
          terrainId: parseInt(nb.terrainId),
          startTime,
          bookingMode: nb.bookingMode,
          userId: nb.member?.id,
          paymentMethod: nb.member ? nb.paymentMethod : undefined,
          guestName: !nb.member ? nb.guestName || undefined : undefined,
          guestPhone: !nb.member ? nb.guestPhone || undefined : undefined,
          bookingType: nb.bookingType,
          notes: nb.notes || undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Réservation créée", en: "Booking created", ar: "تم إنشاء الحجز" }),
          });
          setCreateOpen(false);
          setNb(emptyBooking);
          refresh(startTime);
        },
        onError: (e: any) =>
          toast({
            title: tx({
              fr: "Création impossible",
              en: "Couldn't create booking",
              ar: "تعذر إنشاء الحجز",
            }),
            description: e?.data?.error ?? e?.message,
            variant: "destructive",
          }),
      },
    );
  }

  const statusTone: Record<string, Tone> = {
    confirmed: "success",
    cancelled: "danger",
    pending: "warning",
  };
  const statusLabel = (s: string) =>
    ({
      confirmed: tx({ fr: "Confirmée", en: "Confirmed", ar: "مؤكد" }),
      cancelled: tx({ fr: "Annulée", en: "Cancelled", ar: "ملغى" }),
      pending: tx({ fr: "En attente", en: "Pending", ar: "قيد الانتظار" }),
    })[s] ?? s;
  const typeLabel = (t: string) =>
    ({
      online: tx({ fr: "En ligne", en: "Online", ar: "عبر الإنترنت" }),
      phone: tx({ fr: "Téléphone", en: "Phone", ar: "هاتف" }),
      manual: tx({ fr: "Accueil", en: "Front desk", ar: "الاستقبال" }),
    })[t] ?? t;

  const columns: Column<Reservation>[] = [
    {
      key: "player",
      header: tx({ fr: "Joueur", en: "Player", ar: "اللاعب" }),
      cell: (r) => {
        const name = r.user
          ? displayName(r.user)
          : r.guestName || tx({ fr: "Invité", en: "Guest", ar: "ضيف" });
        return (
          <span className="flex items-center gap-3">
            <Avatar name={name} index={r.id} size={38} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {r.user?.email ??
                  (r.guestPhone ? (
                    <span dir="ltr">{r.guestPhone}</span>
                  ) : (
                    tx({ fr: "Sans compte", en: "No account", ar: "بدون حساب" })
                  ))}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      key: "court",
      header: tx({ fr: "Terrain", en: "Court", ar: "الملعب" }),
      cell: (r) => <span className="font-semibold">{r.terrain?.name}</span>,
    },
    {
      key: "when",
      header: tx({ fr: "Date", en: "When", ar: "الموعد" }),
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold capitalize">
            {format(new Date(r.startTime), "EEE d MMM", { locale })}
          </span>
          <span className="text-xs text-muted-foreground" dir="ltr">
            {clubTime(r.startTime)} – {clubTime(r.endTime)}
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: tx({ fr: "Canal", en: "Channel", ar: "القناة" }),
      hideBelow: "md",
      cell: (r) => <Pill tone="info">{typeLabel(r.bookingType)}</Pill>,
    },
    {
      key: "tokens",
      header: "Tokens",
      hideBelow: "lg",
      cell: (r) => <span className="font-bold">{r.tokensCharged}</span>,
    },
    {
      key: "status",
      header: tx({ fr: "Statut", en: "Status", ar: "الحالة" }),
      cell: (r) => <Pill tone={statusTone[r.status] ?? "muted"}>{statusLabel(r.status)}</Pill>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "end",
      cell: (r) =>
        r.status !== "cancelled" && (
          <Button
            data-testid={`btn-cancel-${r.id}`}
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => handleCancel(r)}
            disabled={cancelMutation.isPending}
          >
            <X />
            {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
          </Button>
        ),
    },
  ];

  const filtered = !!date || terrainFilter !== "all" || statusFilter !== "all";

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Réservations", en: "Reservations", ar: "الحجوزات" })}
        subtitle={tx({
          fr: "Le planning du club en direct, ou la liste complète avec filtres.",
          en: "The live club schedule, or the full list with filters.",
          ar: "جدول النادي المباشر أو القائمة الكاملة.",
        })}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setSeriesOpen(true)}
              data-testid="btn-create-series"
            >
              <Repeat />
              {tx({ fr: "Récurrente", en: "Recurring", ar: "متكرر" })}
            </Button>
            <Button data-testid="btn-create-reservation" onClick={() => setCreateOpen(true)}>
              <Plus />
              {tx({ fr: "Nouvelle réservation", en: "New booking", ar: "حجز جديد" })}
            </Button>
          </>
        }
      />

      <div className="enter self-start">
        <Segmented
          label={tx({ fr: "Affichage", en: "View", ar: "العرض" })}
          value={view}
          onChange={(v) => setView(v as "calendar" | "list" | "series")}
          options={[
            {
              value: "calendar",
              label: (
                <span className="flex items-center gap-2">
                  <LayoutGrid className="size-4" />
                  {tx({ fr: "Planning", en: "Schedule", ar: "الجدول" })}
                </span>
              ),
            },
            {
              value: "list",
              label: (
                <span className="flex items-center gap-2">
                  <List className="size-4" />
                  {tx({ fr: "Liste", en: "List", ar: "القائمة" })}
                </span>
              ),
            },
            {
              value: "series",
              label: (
                <span className="flex items-center gap-2">
                  <Repeat className="size-4" />
                  {tx({ fr: "Récurrentes", en: "Recurring", ar: "متكررة" })}
                </span>
              ),
            },
          ]}
        />
      </div>

      {view === "series" ? (
        loadingSeries ? (
          <div className="h-32 animate-pulse rounded-[26px] bg-card" />
        ) : !series?.length ? (
          <div className="enter flex flex-col items-center gap-3 rounded-[28px] bg-card px-6 py-12 text-center shadow-sm">
            <Repeat className="size-8 text-muted-foreground" />
            <p className="m-0 font-bold">
              {tx({
                fr: "Aucune réservation récurrente",
                en: "No recurring bookings",
                ar: "لا حجوزات متكررة",
              })}
            </p>
            <Button onClick={() => setSeriesOpen(true)}>
              <Plus />
              {tx({ fr: "Créer une série", en: "Create a series", ar: "إنشاء سلسلة" })}
            </Button>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {series.map((sr) => (
              <li
                key={sr.id}
                className="lift enter flex flex-col gap-3 rounded-[26px] bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-lg font-extrabold">{sr.label || sr.who}</span>
                    <span className="text-sm text-muted-foreground">
                      {sr.label ? `${sr.who} · ` : ""}
                      {sr.terrain?.name}
                    </span>
                  </span>
                  <Pill tone={sr.remaining ? "lime" : "muted"}>
                    {tx({
                      fr: `${sr.remaining} à venir`,
                      en: `${sr.remaining} left`,
                      ar: `${sr.remaining} متبقية`,
                    })}
                  </Pill>
                </div>
                <span className="text-sm font-semibold capitalize">
                  {format(new Date(sr.firstStart), "EEEE", { locale })} ·{" "}
                  <span dir="ltr">{clubTime(sr.firstStart)}</span>
                  {sr.intervalWeeks > 1
                    ? tx({
                        fr: ` · toutes les ${sr.intervalWeeks} semaines`,
                        en: ` · every ${sr.intervalWeeks} weeks`,
                        ar: ` · كل ${sr.intervalWeeks} أسابيع`,
                      })
                    : ""}
                </span>
                {sr.nextStart && (
                  <span className="text-sm capitalize text-muted-foreground">
                    {tx({ fr: "Prochaine : ", en: "Next: ", ar: "القادمة: " })}
                    {format(new Date(sr.nextStart), "EEE d MMM", { locale })}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start text-destructive"
                  disabled={cancelSeries.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: tx({
                        fr: "Annuler les séances à venir ?",
                        en: "Cancel upcoming sessions?",
                        ar: "إلغاء الحصص القادمة؟",
                      }),
                      description: tx({
                        fr: `${sr.remaining} séance(s) seront libérées. L'historique est conservé.`,
                        en: `${sr.remaining} session(s) will be freed. History is kept.`,
                        ar: `سيتم تحرير ${sr.remaining} حصة.`,
                      }),
                      confirmLabel: tx({
                        fr: "Annuler la série",
                        en: "Cancel series",
                        ar: "إلغاء السلسلة",
                      }),
                      destructive: true,
                    });
                    if (ok)
                      cancelSeries.mutate(sr.id, {
                        onSuccess: (r) => {
                          toast({
                            title: tx({
                              fr: `${r.cancelled} séance(s) annulée(s)`,
                              en: `${r.cancelled} session(s) cancelled`,
                              ar: `تم إلغاء ${r.cancelled} حصة`,
                            }),
                          });
                          qc.invalidateQueries({ queryKey: extrasKeys.series });
                          qc.invalidateQueries({ queryKey: ["/api/calendar"] });
                        },
                      });
                  }}
                >
                  <X />
                  {tx({ fr: "Annuler la série", en: "Cancel series", ar: "إلغاء السلسلة" })}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : view === "calendar" ? (
        <CourtCalendar isAdmin currentUserId={me?.id ?? null} />
      ) : (
        <>
          <Toolbar
            showClear={filtered}
            onClear={() => {
              setDate("");
              setTerrainFilter("all");
              setStatusFilter("all");
              setPage(1);
            }}
          >
            <Input
              data-testid="input-date-filter"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="w-[180px]"
              aria-label={tx({ fr: "Date", en: "Date", ar: "التاريخ" })}
            />
            <Select
              value={terrainFilter}
              onValueChange={(v) => {
                setTerrainFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger data-testid="select-terrain-filter" className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {tx({ fr: "Tous les terrains", en: "All courts", ar: "كل الملاعب" })}
                </SelectItem>
                {terrains?.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger data-testid="select-status-filter" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {tx({ fr: "Tous les statuts", en: "All statuses", ar: "كل الحالات" })}
                </SelectItem>
                {["confirmed", "pending", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Toolbar>
          <DataTable
            caption={tx({ fr: "Réservations", en: "Reservations", ar: "الحجوزات" })}
            columns={columns}
            rows={data?.data}
            loading={isLoading}
            rowKey={(r) => r.id}
            rowTestId={(r) => `row-reservation-${r.id}`}
            empty={
              <span className="flex flex-col items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-8" />
                {tx({
                  fr: "Aucune réservation ne correspond.",
                  en: "No bookings match.",
                  ar: "لا حجوزات مطابقة.",
                })}
              </span>
            }
            footer={
              data && <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} />
            }
          />
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {tx({ fr: "Réservation manuelle", en: "Manual booking", ar: "حجز يدوي" })}
            </DialogTitle>
            <DialogDescription>
              {tx({
                fr: "Pour un appel, un passage à l'accueil ou un joueur sans compte.",
                en: "For a phone call, a walk-in or a player without an account.",
                ar: "لمكالمة أو زيارة أو لاعب بدون حساب.",
              })}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tx({ fr: "Terrain", en: "Court", ar: "الملعب" })} required>
                <Select
                  value={nb.terrainId}
                  onValueChange={(v) => setNb((b) => ({ ...b, terrainId: v, time: "" }))}
                >
                  <SelectTrigger data-testid="select-terrain">
                    <SelectValue placeholder={tx({ fr: "Choisir", en: "Choose", ar: "اختر" })} />
                  </SelectTrigger>
                  <SelectContent>
                    {terrains
                      ?.filter((t) => t.isActive !== false)
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={tx({ fr: "Jour", en: "Day", ar: "اليوم" })} htmlFor="nb-date" required>
                <Input
                  id="nb-date"
                  data-testid="input-date"
                  type="date"
                  min={format(new Date(), "yyyy-MM-dd")}
                  value={nb.date}
                  onChange={(e) => setNb((b) => ({ ...b, date: e.target.value, time: "" }))}
                />
              </Field>
            </div>
            <Field
              label={tx({
                fr: `Créneau (${rules.bookingDurationMinutes} min)`,
                en: `Slot (${rules.bookingDurationMinutes} min)`,
                ar: `الموعد (${rules.bookingDurationMinutes} دقيقة)`,
              })}
              required
            >
              <div className="flex flex-wrap gap-2" role="radiogroup" data-testid="slot-times">
                {!loadingSlots && nb.date && nb.terrainId && freeSlots.length === 0 && (
                  <p className="m-0 text-sm text-muted-foreground">
                    {tx({
                      fr: "Aucun créneau libre ce jour-là sur ce terrain.",
                      en: "No free slot that day on this court.",
                      ar: "لا توجد مواعيد متاحة في هذا اليوم على هذا الملعب.",
                    })}
                  </p>
                )}
                {freeSlots.map(({ startTime: t }) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={nb.time === t}
                    onClick={() => setNb((b) => ({ ...b, time: t }))}
                    className={`h-10 rounded-full border-2 px-3.5 text-sm font-bold ${nb.time === t ? "border-court bg-court text-white" : "border-[#E4E8F7] hover:border-[#C6CEF6]"}`}
                    dir="ltr"
                  >
                    {clubTime(t)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={tx({ fr: "Formule", en: "Booking type", ar: "النوع" })}>
              <Segmented
                label={tx({ fr: "Formule", en: "Booking type", ar: "النوع" })}
                value={nb.bookingMode}
                onChange={(v) =>
                  setNb((b) => ({ ...b, bookingMode: v as "full_court" | "own_spot" }))
                }
                options={[
                  {
                    value: "full_court",
                    label: tx({ fr: "Terrain complet (4)", en: "Full court (4)", ar: "ملعب كامل" }),
                  },
                  {
                    value: "own_spot",
                    label: tx({ fr: "1 place", en: "1 spot", ar: "مكان واحد" }),
                  },
                ]}
              />
            </Field>
            <Field
              label={tx({ fr: "Membre", en: "Member", ar: "العضو" })}
              hint={tx({
                fr: "Laissez vide pour un joueur sans compte (invité).",
                en: "Leave empty for a player without an account (guest).",
                ar: "اتركه فارغًا للاعب بدون حساب.",
              })}
            >
              <MemberPicker
                value={nb.member}
                onChange={(m) => setNb((b) => ({ ...b, member: m }))}
              />
            </Field>
            {nb.member && (
              <Field label={tx({ fr: "Paiement", en: "Payment", ar: "الدفع" })}>
                <Segmented
                  label={tx({ fr: "Paiement", en: "Payment", ar: "الدفع" })}
                  value={nb.paymentMethod}
                  onChange={(v) =>
                    setNb((b) => ({ ...b, paymentMethod: v as "cash_club" | "token" }))
                  }
                  options={[
                    {
                      value: "cash_club",
                      label: tx({ fr: "Espèces au club", en: "Cash at the club", ar: "نقدًا" }),
                    },
                    {
                      value: "token",
                      label: tx({ fr: "Ses tokens", en: "Their tokens", ar: "رصيده" }),
                    },
                  ]}
                />
              </Field>
            )}
            {!nb.member && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={tx({ fr: "Nom de l'invité", en: "Guest name", ar: "اسم الضيف" })}
                  htmlFor="nb-guest"
                >
                  <Input
                    id="nb-guest"
                    data-testid="input-guest-name"
                    value={nb.guestName}
                    onChange={(e) => setNb((b) => ({ ...b, guestName: e.target.value }))}
                    placeholder="Ahmed Ben Salah"
                  />
                </Field>
                <Field
                  label={tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })}
                  htmlFor="nb-phone"
                >
                  <Input
                    id="nb-phone"
                    type="tel"
                    dir="ltr"
                    value={nb.guestPhone}
                    onChange={(e) => setNb((b) => ({ ...b, guestPhone: e.target.value }))}
                    placeholder="+216 XX XXX XXX"
                  />
                </Field>
              </div>
            )}
            <Field label={tx({ fr: "Canal", en: "Channel", ar: "القناة" })}>
              <Segmented
                label={tx({ fr: "Canal", en: "Channel", ar: "القناة" })}
                value={nb.bookingType}
                onChange={(v) => setNb((b) => ({ ...b, bookingType: v as BookingType }))}
                options={[
                  {
                    value: "phone",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3.5" />
                        {typeLabel("phone")}
                      </span>
                    ),
                  },
                  { value: "manual", label: typeLabel("manual") },
                  { value: "online", label: typeLabel("online") },
                ]}
              />
            </Field>
            <Field label={tx({ fr: "Notes", en: "Notes", ar: "ملاحظات" })} htmlFor="nb-notes">
              <Textarea
                id="nb-notes"
                rows={2}
                value={nb.notes}
                onChange={(e) => setNb((b) => ({ ...b, notes: e.target.value }))}
                placeholder={tx({ fr: "Optionnel", en: "Optional", ar: "اختياري" })}
              />
            </Field>
            <Button
              data-testid="btn-confirm-booking"
              type="submit"
              size="lg"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? tx({ fr: "Création…", en: "Creating…", ar: "جارٍ الإنشاء…" })
                : tx({ fr: "Créer la réservation", en: "Create booking", ar: "إنشاء الحجز" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <SeriesDialog open={seriesOpen} onOpenChange={setSeriesOpen} />
      {dialog}
    </Page>
  );
}
