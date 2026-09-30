import { useState } from "react";
import { format } from "date-fns";
import {
  useListReservations,
  useCancelReservation,
  useCreateReservation,
  useListTerrains,
  useListUsers,
  useGetMe,
  getListReservationsQueryKey,
  getCalendarQueryKey,
} from "@workspace/api-client-react";
import type { Reservation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid, List, X, CalendarDays, Phone } from "lucide-react";
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

const PAGE = 20;
type BookingType = "manual" | "phone" | "online";
const emptyBooking = {
  terrainId: "",
  startTime: "",
  userId: "",
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

  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [date, setDate] = useState("");
  const [terrainFilter, setTerrainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [nb, setNb] = useState(emptyBooking);

  const params: Record<string, any> = { page, limit: PAGE };
  if (date) params.date = date;
  if (terrainFilter !== "all") params.terrainId = parseInt(terrainFilter);
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, isLoading } = useListReservations(params, {
    query: { queryKey: getListReservationsQueryKey(params), enabled: view === "list" },
  });
  const { data: terrains } = useListTerrains();
  const { data: usersData } = useListUsers({ limit: 100 } as any);
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
    if (!nb.terrainId || !nb.startTime) {
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
          startTime: new Date(nb.startTime).toISOString(),
          userId: nb.userId ? parseInt(nb.userId) : undefined,
          guestName: !nb.userId ? nb.guestName || undefined : undefined,
          guestPhone: !nb.userId ? nb.guestPhone || undefined : undefined,
          bookingType: nb.bookingType,
          notes: nb.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Réservation créée", en: "Booking created", ar: "تم إنشاء الحجز" }),
          });
          setCreateOpen(false);
          setNb(emptyBooking);
          refresh(new Date(nb.startTime).toISOString());
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
            {format(new Date(r.startTime), "HH:mm")} – {format(new Date(r.endTime), "HH:mm")}
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
          <Button data-testid="btn-create-reservation" onClick={() => setCreateOpen(true)}>
            <Plus />
            {tx({ fr: "Nouvelle réservation", en: "New booking", ar: "حجز جديد" })}
          </Button>
        }
      />

      <div className="enter self-start">
        <Segmented
          label={tx({ fr: "Affichage", en: "View", ar: "العرض" })}
          value={view}
          onChange={(v) => setView(v as "calendar" | "list")}
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
          ]}
        />
      </div>

      {view === "calendar" ? (
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
                  onValueChange={(v) => setNb((b) => ({ ...b, terrainId: v }))}
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
              <Field
                label={tx({ fr: "Début", en: "Start", ar: "البداية" })}
                htmlFor="nb-start"
                required
              >
                <Input
                  id="nb-start"
                  data-testid="input-start-time"
                  type="datetime-local"
                  step={1800}
                  value={nb.startTime}
                  onChange={(e) => setNb((b) => ({ ...b, startTime: e.target.value }))}
                />
              </Field>
            </div>
            <Field
              label={tx({ fr: "Membre", en: "Member", ar: "العضو" })}
              hint={tx({
                fr: "Laissez « Invité » pour un joueur sans compte.",
                en: "Keep “Guest” for a player without an account.",
                ar: "اترك «ضيف» للاعب بدون حساب.",
              })}
            >
              <Select
                value={nb.userId || "guest"}
                onValueChange={(v) => setNb((b) => ({ ...b, userId: v === "guest" ? "" : v }))}
              >
                <SelectTrigger data-testid="select-user">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">
                    {tx({
                      fr: "Invité (sans compte)",
                      en: "Guest (no account)",
                      ar: "ضيف (بدون حساب)",
                    })}
                  </SelectItem>
                  {usersData?.data?.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {displayName(u)} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {!nb.userId && (
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
      {dialog}
    </Page>
  );
}
