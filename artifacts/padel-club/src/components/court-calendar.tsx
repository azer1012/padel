import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  useGetCalendar,
  useCreateReservation,
  useJoinSession,
  useMakeSessionPublic,
  useMakeSessionPrivate,
  useLeaveSession,
  useUpdatePlayerPayment,
  useCancelReservation,
  useGetTokenBalance,
  useAddPlayer,
  useRemovePlayer,
  useBlockSlot,
  getCalendarQueryKey,
  getListReservationsQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
  getOpenMatchesQueryKey,
  apiErrorMessage,
  apiErrorCode,
} from "@workspace/api-client-react";
import type {
  CalendarSlot,
  CalendarTerrain,
  EquipmentLine,
  Reservation,
  User,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Coins,
  Globe,
  Lock,
  CheckCircle2,
  X,
  ShieldAlert,
  UserPlus,
  LogOut,
  CalendarX2,
  Sun,
  Warehouse,
  Zap,
  Users,
  Banknote,
  PartyPopper,
  Phone,
  Wrench,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useTx, useDateLocale, useI18n } from "@/lib/i18n";
import { clubDate, clubDay, clubDays, clubTime } from "@/lib/club-time";
import { cn } from "@/lib/utils";
import { Avatar, CourtLines, EmptyState, LiveDot } from "@/components/smash/primitives";
import { EquipmentPicker } from "@/components/smash/equipment-picker";
import { PaymentBadge } from "@/components/smash/payment-badge";
import { InvitePanel } from "@/components/smash/invite-panel";
import { MemberPicker } from "@/components/smash/member-picker";
import { CLUB } from "@/config/club";

type Terrain = CalendarTerrain["terrain"];
type Modal =
  | { type: "book"; slot: CalendarSlot; terrain: Terrain }
  | { type: "match"; slot: CalendarSlot; terrain: Terrain }
  | null;
type SlotState = "available" | "partial" | "full" | "mine" | "past" | "blocked";

/** Local key of a day from the day strip (built from club days). */
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
/** Times are club times, whatever the visitor's timezone. */
const hhmm = clubTime;
const tokens = (n: number) => `${n} token${n > 1 ? "s" : ""}`;

function slotState(slot: CalendarSlot): SlotState {
  if (slot.isMine) return "mine";
  if (slot.isBlocked) return "blocked";
  if (slot.isPast || slot.status === "past") return "past";
  if (slot.status === "available") return "available";
  if (slot.status === "full") return "full";
  return "partial";
}

/** Invalidate everything a booking action can change. */
function useRefreshBookings() {
  const qc = useQueryClient();
  return (startTime: string) => {
    qc.invalidateQueries({ queryKey: getCalendarQueryKey({ date: clubDay(startTime) }) });
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
    qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/equipment"] });
  };
}

function DialogHero({
  terrain,
  slot,
  children,
}: {
  terrain: Terrain;
  slot: CalendarSlot;
  children?: React.ReactNode;
}) {
  const tx = useTx();
  const { lang } = useI18n();
  return (
    <div className="on-dark relative -mx-6 -mt-6 overflow-hidden rounded-t-[32px] bg-night px-6 pb-6 pt-7 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute -end-10 -top-6 h-[120px] w-[220px] rotate-[-9deg] rounded-lg border-[3px] border-white/15 bg-court/40"
      >
        <CourtLines />
      </div>
      <DialogHeader className="relative text-start">
        <span className="label flex items-center gap-2 text-ball">
          {terrain.type === "outdoor" ? (
            <Sun className="size-4" />
          ) : (
            <Warehouse className="size-4" />
          )}
          {terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
          {slot.isPeak && (
            <span className="flex items-center gap-1 rounded-full bg-coral px-2.5 py-0.5 text-[11px] font-extrabold normal-case tracking-normal text-night">
              <Zap className="size-3" />
              {slot.priceLabel ||
                tx({ fr: "Heures pleines", en: "Peak hours", ar: "ساعات الذروة" })}
            </span>
          )}
        </span>
        <DialogTitle className="text-[32px] leading-none text-white">{terrain.name}</DialogTitle>
        <DialogDescription className="text-base capitalize text-soft-d">
          {clubDate(slot.startTime, lang)} ·{" "}
          <span className="font-bold text-white" dir="ltr">
            {hhmm(slot.startTime)} – {hhmm(slot.endTime)}
          </span>
        </DialogDescription>
        {children}
      </DialogHeader>
    </div>
  );
}

/* ───────────────────────────── Book a free slot ───────────────────────────── */

function BookDialog({
  slot,
  terrain,
  isAdmin,
  onClose,
}: {
  slot: CalendarSlot;
  terrain: Terrain;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const tx = useTx();
  const { toast } = useToast();
  const refresh = useRefreshBookings();
  const { data: balance } = useGetTokenBalance();
  const createReservation = useCreateReservation();
  const blockSlot = useBlockSlot();

  const [mode, setMode] = useState<"full_court" | "own_spot">("full_court");
  const [isPublic, setIsPublic] = useState(true);
  const [publicDescription, setPublicDescription] = useState("");
  const [equipment, setEquipment] = useState<EquipmentLine[]>([]);
  const [booked, setBooked] = useState<Reservation | null>(null);
  // Admin desk
  const [forWho, setForWho] = useState<"member" | "guest">("member");
  const [member, setMember] = useState<User | null>(null);
  const [payment, setPayment] = useState<"token" | "cash_club">("cash_club");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const perSpot = slot.tokensPerSpot ?? CLUB.tokensOwnSpot;
  const cost = mode === "own_spot" ? perSpot : perSpot * 4;
  const cash = (mode === "own_spot" ? 1 : 4) * (slot.pricePerPerson ?? terrain.pricePerPerson);
  const payer = isAdmin ? (forWho === "member" ? member : null) : null;
  const paysTokens = isAdmin ? forWho === "member" && payment === "token" : true;
  const wallet = isAdmin ? (payer?.tokenBalance ?? null) : (balance?.balance ?? null);
  const short = paysTokens && wallet !== null && wallet < cost;
  const adminIncomplete = isAdmin && (forWho === "member" ? !member : !guestName.trim());

  const book = () =>
    createReservation.mutate(
      {
        data: {
          terrainId: terrain.id,
          startTime: slot.startTime,
          bookingMode: mode,
          isPublic: mode === "own_spot" && isPublic,
          publicDescription: mode === "own_spot" && isPublic ? publicDescription : undefined,
          equipment: equipment.length ? equipment : undefined,
          ...(isAdmin
            ? forWho === "member"
              ? { userId: member?.id, paymentMethod: payment }
              : { guestName, guestPhone, bookingType: "phone" }
            : {}),
        } as any,
      },
      {
        onSuccess: (r) => {
          refresh(slot.startTime);
          setBooked(r);
        },
        onError: (e) => {
          refresh(slot.startTime);
          const taken = apiErrorCode(e) === "SLOT_TAKEN";
          toast({
            title: taken
              ? tx({
                  fr: "Ce créneau vient d'être réservé",
                  en: "This slot was just booked",
                  ar: "تم حجز هذا الموعد للتو",
                })
              : tx({ fr: "Réservation impossible", en: "Booking failed", ar: "تعذر الحجز" }),
            description: taken
              ? tx({
                  fr: "Aucun token n'a été débité. Choisissez un autre créneau.",
                  en: "No token was charged. Pick another slot.",
                  ar: "لم يتم خصم أي رصيد. اختر موعدًا آخر.",
                })
              : apiErrorMessage(
                  e,
                  tx({ fr: "Réessayez.", en: "Please try again.", ar: "حاول مجددًا." }),
                ),
            variant: "destructive",
          });
          if (taken) onClose();
        },
      },
    );

  const block = () =>
    blockSlot.mutate(
      { terrainId: terrain.id, startTime: slot.startTime, reason: "Maintenance" },
      {
        onSuccess: () => {
          refresh(slot.startTime);
          toast({ title: tx({ fr: "Créneau bloqué", en: "Slot blocked", ar: "تم حجب الموعد" }) });
          onClose();
        },
        onError: (e) =>
          toast({ title: "Oups", description: apiErrorMessage(e, ""), variant: "destructive" }),
      },
    );

  if (booked) {
    const invitable = !!booked.userId && !isAdmin;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-16 animate-[pop_.45s_var(--ease-out-soft)_both] items-center justify-center rounded-full bg-ball text-night">
            <PartyPopper className="size-7" />
          </span>
          <h3 className="disp m-0 text-3xl">
            {tx({ fr: "C'est réservé !", en: "You're booked!", ar: "تم الحجز!" })}
          </h3>
          <p className="m-0 text-muted-foreground">
            {terrain.name} ·{" "}
            <span dir="ltr">
              {hhmm(slot.startTime)} – {hhmm(slot.endTime)}
            </span>
            {booked.tokensCharged ? ` · ${tokens(booked.tokensCharged)}` : ""}
          </p>
        </div>
        {invitable && (
          <InvitePanel
            reservationId={booked.id}
            free={booked.bookingMode === "full_court"}
            shareText={tx({
              fr: `Padel ${terrain.name}, ${clubDate(slot.startTime, "fr", { day: "2-digit", month: "2-digit" })} à ${hhmm(slot.startTime)}. Rejoins-moi :`,
              en: `Padel ${terrain.name}, ${clubDate(slot.startTime, "fr", { day: "2-digit", month: "2-digit" })} at ${hhmm(slot.startTime)}. Join me:`,
              ar: `بادل ${terrain.name}، ${clubDate(slot.startTime, "fr", { day: "2-digit", month: "2-digit" })} على ${hhmm(slot.startTime)}. انضم إليّ:`,
            })}
          />
        )}
        <div className="flex gap-2.5">
          {!isAdmin && (
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/reservations">
                {tx({ fr: "Mes réservations", en: "My bookings", ar: "حجوزاتي" })}
              </Link>
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>
            {tx({ fr: "Terminé", en: "Done", ar: "تم" })}
          </Button>
        </div>
      </div>
    );
  }

  const modes = [
    {
      id: "full_court" as const,
      icon: <Users className="size-5" />,
      title: tx({ fr: "Terrain complet", en: "Full court", ar: "ملعب كامل" }),
      text: tx({
        fr: "Je paie les 4 places, mes 3 amis jouent gratuitement",
        en: "I pay all 4 spots, my 3 friends play free",
        ar: "أدفع الأماكن الأربعة وأصدقائي يلعبون مجانًا",
      }),
      cost: perSpot * 4,
    },
    {
      id: "own_spot" as const,
      icon: <UserRound className="size-5" />,
      title: tx({ fr: "Ma place", en: "Just my spot", ar: "مكاني فقط" }),
      text: tx({
        fr: "Je paie 1 place, les 3 autres restent ouvertes",
        en: "I pay 1 spot, the other 3 stay open",
        ar: "أدفع مكانًا واحدًا والثلاثة الباقية مفتوحة",
      }),
      cost: perSpot,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {isAdmin && (
        <fieldset className="m-0 flex flex-col gap-3 rounded-[22px] border border-[#E4E8F7] p-4">
          <legend className="label px-1 text-muted-foreground">
            {tx({
              fr: "Réservation au comptoir",
              en: "Front-desk booking",
              ar: "حجز من الاستقبال",
            })}
          </legend>
          <div className="flex rounded-full bg-secondary p-1" role="group">
            {(["member", "guest"] as const).map((w) => (
              <button
                key={w}
                type="button"
                className="pill-tab h-9 flex-1"
                aria-pressed={forWho === w}
                onClick={() => setForWho(w)}
              >
                {w === "member"
                  ? tx({ fr: "Membre", en: "Member", ar: "عضو" })
                  : tx({ fr: "Invité / téléphone", en: "Guest / phone", ar: "زائر / هاتف" })}
              </button>
            ))}
          </div>
          {forWho === "member" ? (
            <>
              <MemberPicker value={member} onChange={setMember} />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment">
                {(["cash_club", "token"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={payment === p}
                    onClick={() => setPayment(p)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-sm font-bold",
                      payment === p ? "border-court bg-[#EEF1FF]" : "border-[#E4E8F7]",
                    )}
                  >
                    {p === "token" ? <Coins className="size-4" /> : <Banknote className="size-4" />}
                    {p === "token"
                      ? tx({ fr: "Ses tokens", en: "Their tokens", ar: "رصيده" })
                      : tx({ fr: "Espèces au club", en: "Cash at club", ar: "نقدًا في النادي" })}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="guest-name">{tx({ fr: "Nom", en: "Name", ar: "الاسم" })}</Label>
                <Input
                  id="guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="guest-phone">
                  {tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })}
                </Label>
                <Input
                  id="guest-phone"
                  type="tel"
                  inputMode="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div
        role="radiogroup"
        aria-label={tx({ fr: "Formule", en: "Booking type", ar: "نوع الحجز" })}
        className="grid grid-cols-2 gap-3"
      >
        {modes.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex flex-col gap-1.5 rounded-[22px] border-[3px] p-4 text-start transition-[border-color,background-color,transform] active:scale-[.98]",
                on ? "border-court bg-[#EEF1FF]" : "border-[#E4E8F7] hover:border-[#C6CEF6]",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full",
                    on ? "bg-court text-white" : "bg-secondary",
                  )}
                >
                  {m.icon}
                </span>
                <span
                  className={cn(
                    "size-5 rounded-full border-[3px]",
                    on ? "border-court bg-court" : "border-[#C6CEF6]",
                  )}
                />
              </span>
              <span className="text-base font-extrabold">{m.title}</span>
              <span className="text-[13px] leading-snug text-muted-foreground">{m.text}</span>
              <span className="mt-1 flex items-center gap-1.5 text-lg font-extrabold text-court">
                <Coins className="size-4" />
                {tokens(m.cost)}
              </span>
            </button>
          );
        })}
      </div>

      {mode === "own_spot" && (
        <div className="flex flex-col gap-3 rounded-[22px] bg-secondary p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-bold">
                {tx({
                  fr: "Ouvrir aux joueurs du club",
                  en: "Open to club players",
                  ar: "مفتوح لأعضاء النادي",
                })}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {tx({
                  fr: "Votre match apparaît dans les open matches.",
                  en: "Your match shows up in open matches.",
                  ar: "تظهر مباراتك في المباريات المفتوحة.",
                })}
              </span>
            </span>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
          {isPublic && (
            <Input
              value={publicDescription}
              maxLength={200}
              onChange={(e) => setPublicDescription(e.target.value)}
              placeholder={tx({
                fr: "Ex : niveau 3, débutants bienvenus",
                en: "e.g. level 3, beginners welcome",
                ar: "مثال: مستوى 3",
              })}
            />
          )}
        </div>
      )}

      <EquipmentPicker startTime={slot.startTime} value={equipment} onChange={setEquipment} />

      <dl className="m-0 flex flex-col gap-2.5 rounded-[22px] border border-[#E4E8F7] p-4 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {tx({ fr: "Durée", en: "Duration", ar: "المدة" })}
          </dt>
          <dd className="m-0 font-bold">{CLUB.slotMinutes} min</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {tx({ fr: "Prix au club", en: "Club price", ar: "السعر في النادي" })}
          </dt>
          <dd className="m-0 font-bold">
            {cash} {CLUB.currency}
          </dd>
        </div>
        {wallet !== null && paysTokens && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {tx({ fr: "Solde", en: "Balance", ar: "الرصيد" })}
            </dt>
            <dd className={cn("m-0 font-bold", short && "text-destructive")}>{tokens(wallet)}</dd>
          </div>
        )}
        <div className="flex items-end justify-between border-t border-[#E4E8F7] pt-3">
          <dt className="font-bold">Total</dt>
          <dd className="disp m-0 text-3xl">
            {paysTokens ? tokens(cost) : `${cash} ${CLUB.currency}`}
          </dd>
        </div>
      </dl>

      {short && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-2xl bg-[#FFEBD9] px-4 py-3 text-sm font-semibold text-[#7A3A0D]"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          {tx({
            fr: "Solde insuffisant. Les tokens s'achètent en espèces à l'accueil du club.",
            en: "Not enough tokens. Buy tokens with cash at the club front desk.",
            ar: "رصيد غير كافٍ. يُشترى الرصيد نقدًا من استقبال النادي.",
          })}
        </p>
      )}

      <div className="flex gap-2.5">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
          disabled={createReservation.isPending}
        >
          {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
        </Button>
        <Button
          className="flex-[1.4]"
          onClick={book}
          disabled={createReservation.isPending || short || adminIncomplete}
        >
          {createReservation.isPending
            ? tx({ fr: "Réservation…", en: "Booking…", ar: "جارٍ الحجز…" })
            : tx({ fr: "Confirmer", en: "Confirm", ar: "تأكيد" })}
        </Button>
      </div>
      {isAdmin && (
        <Button variant="outline-destructive" onClick={block} disabled={blockSlot.isPending}>
          <Wrench />
          {tx({ fr: "Bloquer (maintenance)", en: "Block (maintenance)", ar: "حجب (صيانة)" })}
        </Button>
      )}
    </div>
  );
}

/* ───────────────────────────── A booked match ───────────────────────────── */

function MatchDialog({
  slot,
  terrain,
  isAdmin,
  currentUserId,
  onClose,
}: {
  slot: CalendarSlot;
  terrain: Terrain;
  isAdmin: boolean;
  currentUserId: number | null;
  onClose: () => void;
}) {
  const tx = useTx();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const refresh = useRefreshBookings();
  const joinSession = useJoinSession();
  const leaveSession = useLeaveSession();
  const cancelReservation = useCancelReservation();
  const makePublic = useMakeSessionPublic();
  const makePrivate = useMakeSessionPrivate();
  const updatePayment = useUpdatePlayerPayment();
  const addPlayer = useAddPlayer();
  const removePlayer = useRemovePlayer();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [newPlayer, setNewPlayer] = useState<User | null>(null);

  const id = slot.reservationId!;
  const full = slot.bookingMode === "full_court";
  const perSpot = slot.tokensPerSpot ?? CLUB.tokensOwnSpot;
  const meInMatch = slot.players.some((p) => p.userId != null && p.userId === currentUserId);
  const canJoin = !slot.isMine && !full && slot.openSpots > 0 && !slot.isPast && !slot.isBlocked;
  const canInvite =
    !slot.isPast &&
    (slot.isOrganizer || (!full && meInMatch)) &&
    (full ? slot.players.length < slot.totalSpots : slot.openSpots > 0);
  const canLeave = meInMatch && !slot.isPast && !(full && slot.isOrganizer);
  const canCancel = !slot.isPast && slot.isOrganizer;
  const fail = (title: string) => (e: unknown) =>
    toast({ title, description: apiErrorMessage(e, ""), variant: "destructive" });
  const done =
    (title: string, description?: string, close = true) =>
    () => {
      refresh(slot.startTime);
      toast({ title, description });
      if (close) onClose();
    };

  const join = (paymentMethod: "token" | "cash_club") => {
    if (!isSignedIn) {
      setLocation(`/sign-in?redirect=${encodeURIComponent("/terrains")}`);
      return;
    }
    joinSession.mutate(
      { id, paymentMethod },
      {
        onSuccess: done(
          tx({
            fr: "Vous êtes dans le match !",
            en: "You're in the match!",
            ar: "أنت في المباراة!",
          }),
          paymentMethod === "token"
            ? tx({
                fr: `${tokens(perSpot)} débité(s).`,
                en: `${tokens(perSpot)} charged.`,
                ar: `تم خصم ${perSpot}.`,
              })
            : tx({
                fr: "Place réservée, à régler au club.",
                en: "Spot held, pay at the club.",
                ar: "تم حجز المكان، الدفع في النادي.",
              }),
        ),
        onError: fail(
          tx({ fr: "Impossible de rejoindre", en: "Couldn't join", ar: "تعذر الانضمام" }),
        ),
      },
    );
  };

  const players = slot.players;
  const reservedSeats = full ? Math.max(0, slot.totalSpots - players.length) : 0;
  const openSeats = full ? 0 : slot.openSpots;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {slot.isBlocked ? (
          <Badge variant="muted">{tx({ fr: "Bloqué", en: "Blocked", ar: "محجوب" })}</Badge>
        ) : full ? (
          <Badge variant="muted">
            {tx({
              fr: "Terrain complet réservé",
              en: "Full court booked",
              ar: "ملعب محجوز بالكامل",
            })}
          </Badge>
        ) : (
          <Badge variant={slot.openSpots ? "lime" : "muted"}>
            {slot.openSpots
              ? tx({
                  fr: `${slot.openSpots} place(s) libre(s)`,
                  en: `${slot.openSpots} open spot(s)`,
                  ar: `${slot.openSpots} مكان شاغر`,
                })
              : tx({ fr: "Complet", en: "Full", ar: "مكتمل" })}
          </Badge>
        )}
        {slot.isPublic && (
          <Badge variant="outline" className="gap-1">
            <Globe className="size-3" />
            Open match
          </Badge>
        )}
        {slot.isMine && (
          <Badge>{tx({ fr: "Vous jouez", en: "You're playing", ar: "أنت تلعب" })}</Badge>
        )}
      </div>

      {slot.publicDescription && (
        <p className="m-0 rounded-2xl bg-secondary px-4 py-3 text-[15px] italic">
          “{slot.publicDescription}”
        </p>
      )}

      {isAdmin && (slot.guestPhone || slot.notes || (!players.length && slot.creatorName)) && (
        <div className="flex flex-col gap-1 rounded-2xl bg-secondary px-4 py-3 text-sm">
          {slot.creatorName && <span className="font-bold">{slot.creatorName}</span>}
          {slot.guestPhone && (
            <a
              href={`tel:${slot.guestPhone}`}
              className="flex items-center gap-1.5 font-semibold text-court"
              dir="ltr"
            >
              <Phone className="size-3.5" />
              {slot.guestPhone}
            </a>
          )}
          {slot.notes && <span className="text-muted-foreground">{slot.notes}</span>}
        </div>
      )}

      {!slot.isBlocked && (
        <div className="flex flex-col gap-2">
          <span className="label text-muted-foreground">
            {tx({ fr: "Joueurs", en: "Players", ar: "اللاعبون" })} ·{" "}
            {players.length + reservedSeats}/{slot.totalSpots}
          </span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {players.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl bg-secondary/70 p-2.5 pe-3"
              >
                <Avatar name={p.name} index={i} size={40} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">
                    {p.name}
                    {p.userId != null && p.userId === currentUserId && (
                      <span className="ms-2 text-xs font-extrabold text-court">
                        ({tx({ fr: "vous", en: "you", ar: "أنت" })})
                      </span>
                    )}
                  </span>
                  <PaymentBadge
                    type={p.paymentType}
                    status={p.paymentStatus}
                    className="mt-1 w-fit"
                  />
                </span>
                {isAdmin && p.paymentType === "cash_club" && (
                  <Button
                    size="sm"
                    variant={p.paymentStatus === "paid" ? "ghost" : "secondary"}
                    className="h-8 px-3 text-xs"
                    disabled={updatePayment.isPending}
                    onClick={() =>
                      updatePayment.mutate(
                        {
                          reservationId: id,
                          playerId: p.id,
                          paymentStatus: p.paymentStatus === "paid" ? "pending" : "paid",
                        },
                        {
                          onSuccess: done(
                            tx({
                              fr: "Paiement mis à jour",
                              en: "Payment updated",
                              ar: "تم تحديث الدفع",
                            }),
                            undefined,
                            false,
                          ),
                          onError: fail("Oups"),
                        },
                      )
                    }
                  >
                    {p.paymentStatus === "paid"
                      ? tx({ fr: "Annuler", en: "Undo", ar: "تراجع" })
                      : tx({ fr: "Encaisser", en: "Mark paid", ar: "تحصيل" })}
                  </Button>
                )}
                {isAdmin && !slot.isPast && (
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-white hover:text-destructive"
                    aria-label={tx({
                      fr: `Retirer ${p.name}`,
                      en: `Remove ${p.name}`,
                      ar: `إزالة ${p.name}`,
                    })}
                    disabled={removePlayer.isPending}
                    onClick={() =>
                      removePlayer.mutate(
                        { reservationId: id, playerId: p.id },
                        {
                          onSuccess: done(
                            tx({
                              fr: "Joueur retiré",
                              en: "Player removed",
                              ar: "تمت إزالة اللاعب",
                            }),
                            undefined,
                            false,
                          ),
                          onError: fail("Oups"),
                        },
                      )
                    }
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: reservedSeats }, (_, i) => (
              <li
                key={`r-${i}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#DCE2F8] p-2.5"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-ball/60 text-night">
                  <UserPlus className="size-4" />
                </span>
                <span className="text-[15px] text-muted-foreground">
                  {tx({
                    fr: "Place payée · pour un ami",
                    en: "Paid spot · for a friend",
                    ar: "مكان مدفوع · لصديق",
                  })}
                </span>
              </li>
            ))}
            {Array.from({ length: openSeats }, (_, i) => (
              <li
                key={`o-${i}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#DCE2F8] p-2.5"
              >
                <span className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-[#C6CEF6] text-lg text-muted-foreground">
                  +
                </span>
                <span className="text-[15px] text-muted-foreground">
                  {tx({ fr: "Place libre", en: "Open spot", ar: "مكان شاغر" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canJoin && (
        <div className="flex flex-col gap-2">
          <span className="label text-muted-foreground">
            {tx({ fr: "Prendre une place", en: "Take a spot", ar: "احجز مكانًا" })}
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => join("token")} disabled={joinSession.isPending}>
              <Coins />
              {tx({
                fr: `Payer ${tokens(perSpot)}`,
                en: `Pay ${tokens(perSpot)}`,
                ar: `ادفع ${perSpot} رصيد`,
              })}
            </Button>
            <Button
              variant="outline"
              onClick={() => join("cash_club")}
              disabled={joinSession.isPending}
            >
              <Banknote />
              {tx({ fr: "Payer au club", en: "Pay at the club", ar: "الدفع في النادي" })}
            </Button>
          </div>
        </div>
      )}

      {canInvite &&
        (showInvite ? (
          <InvitePanel
            reservationId={id}
            free={full}
            shareText={tx({
              fr: `Padel ${terrain.name}, ${clubDate(slot.startTime, "fr", { day: "2-digit", month: "2-digit" })} à ${hhmm(slot.startTime)}. Rejoins-moi :`,
              en: `Padel ${terrain.name}, ${clubDate(slot.startTime, "fr", { day: "2-digit", month: "2-digit" })} at ${hhmm(slot.startTime)}. Join me:`,
              ar: `بادل ${terrain.name}، ${clubDate(slot.startTime, "fr", { day: "2-digit", month: "2-digit" })} على ${hhmm(slot.startTime)}. انضم إليّ:`,
            })}
          />
        ) : (
          <Button variant="dark" onClick={() => setShowInvite(true)}>
            <UserPlus />
            {tx({ fr: "Inviter des joueurs", en: "Invite players", ar: "ادعُ لاعبين" })}
          </Button>
        ))}

      {isAdmin && !slot.isPast && !slot.isBlocked && players.length < slot.totalSpots && (
        <div className="flex flex-col gap-2 border-t border-[#E4E8F7] pt-4">
          <span className="label text-muted-foreground">
            {tx({ fr: "Ajouter un joueur", en: "Add a player", ar: "إضافة لاعب" })}
            {full
              ? ` · ${tx({ fr: "gratuit (terrain payé)", en: "free (court paid)", ar: "مجانًا" })}`
              : ` · ${tx({ fr: "espèces au club", en: "cash at the club", ar: "نقدًا" })}`}
          </span>
          <MemberPicker
            value={newPlayer}
            onChange={setNewPlayer}
            excludeIds={players.map((p) => p.userId ?? -1)}
          />
          {newPlayer && (
            <Button
              disabled={addPlayer.isPending}
              onClick={() =>
                addPlayer.mutate(
                  { reservationId: id, userId: newPlayer.id, paymentType: "cash_club" },
                  {
                    onSuccess: () => {
                      setNewPlayer(null);
                      done(
                        tx({ fr: "Joueur ajouté", en: "Player added", ar: "تمت إضافة اللاعب" }),
                        undefined,
                        false,
                      )();
                    },
                    onError: fail("Oups"),
                  },
                )
              }
            >
              <UserPlus />
              {tx({ fr: "Ajouter", en: "Add", ar: "إضافة" })}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {(slot.isOrganizer || isAdmin) && !full && !slot.isPast && (
          <Button
            variant="outline"
            disabled={makePublic.isPending || makePrivate.isPending}
            onClick={() =>
              (slot.isPublic ? makePrivate : makePublic).mutate(
                { id },
                {
                  onSuccess: done(
                    slot.isPublic
                      ? tx({ fr: "Match privé", en: "Match is private", ar: "المباراة خاصة" })
                      : tx({
                          fr: "Match ouvert au club",
                          en: "Match open to the club",
                          ar: "المباراة مفتوحة",
                        }),
                    undefined,
                    false,
                  ),
                  onError: fail("Oups"),
                },
              )
            }
          >
            {slot.isPublic ? <Lock /> : <Globe />}
            {slot.isPublic
              ? tx({ fr: "Rendre privé", en: "Make private", ar: "اجعلها خاصة" })
              : tx({ fr: "Ouvrir au club", en: "Open to the club", ar: "افتحها للنادي" })}
          </Button>
        )}
        {canLeave && (
          <Button
            variant="outline-destructive"
            disabled={leaveSession.isPending}
            onClick={() =>
              leaveSession.mutate(
                { id },
                {
                  onSuccess: done(
                    tx({
                      fr: "Vous avez quitté le match",
                      en: "You left the match",
                      ar: "غادرت المباراة",
                    }),
                  ),
                  onError: fail(
                    tx({ fr: "Impossible de quitter", en: "Couldn't leave", ar: "تعذر المغادرة" }),
                  ),
                },
              )
            }
          >
            <LogOut />
            {tx({ fr: "Quitter", en: "Leave", ar: "مغادرة" })}
          </Button>
        )}
        {(canCancel || (isAdmin && !slot.isPast)) &&
          (confirmCancel ? (
            <Button
              variant="destructive"
              disabled={cancelReservation.isPending}
              onClick={() =>
                cancelReservation.mutate(
                  { id },
                  {
                    onSuccess: done(
                      tx({
                        fr: "Réservation annulée",
                        en: "Booking cancelled",
                        ar: "تم إلغاء الحجز",
                      }),
                      tx({
                        fr: "Les tokens payés ont été remboursés.",
                        en: "Tokens paid were refunded.",
                        ar: "تم إرجاع الرصيد المدفوع.",
                      }),
                    ),
                    onError: fail(
                      tx({
                        fr: "Annulation impossible",
                        en: "Couldn't cancel",
                        ar: "تعذر الإلغاء",
                      }),
                    ),
                  },
                )
              }
            >
              <CheckCircle2 />
              {tx({
                fr: "Confirmer l'annulation",
                en: "Confirm cancellation",
                ar: "تأكيد الإلغاء",
              })}
            </Button>
          ) : (
            <Button variant="outline-destructive" onClick={() => setConfirmCancel(true)}>
              <X />
              {slot.isBlocked
                ? tx({ fr: "Débloquer", en: "Unblock", ar: "إلغاء الحجب" })
                : tx({ fr: "Annuler la réservation", en: "Cancel booking", ar: "إلغاء الحجز" })}
            </Button>
          ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── Planning grid ───────────────────────────── */

function cellLabel(
  state: SlotState,
  slot: CalendarSlot,
  isAdmin: boolean,
  tx: ReturnType<typeof useTx>,
) {
  switch (state) {
    case "available":
      return tx({ fr: "Libre", en: "Free", ar: "متاح" });
    case "mine":
      return tx({ fr: "Mon match", en: "My match", ar: "مباراتي" });
    case "blocked":
      return tx({ fr: "Fermé", en: "Closed", ar: "مغلق" });
    case "full":
      return isAdmin && slot.creatorName
        ? slot.creatorName
        : tx({ fr: "Complet", en: "Full", ar: "مكتمل" });
    case "partial":
      return tx({
        fr: `${slot.openSpots} place${slot.openSpots > 1 ? "s" : ""}`,
        en: `${slot.openSpots} open`,
        ar: `${slot.openSpots} شاغر`,
      });
    default:
      return slot.reservationId ? `${slot.filledSpots}/${slot.totalSpots}` : "";
  }
}

export default function CourtCalendar({
  isAdmin = false,
  currentUserId = null,
}: {
  isAdmin?: boolean;
  currentUserId?: number | null;
}) {
  const tx = useTx();
  const locale = useDateLocale();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const days = useMemo(() => clubDays(14), []);
  const [dayIndex, setDayIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "indoor" | "outdoor">("all");
  const [modal, setModal] = useState<Modal>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const date = dayKey(days[dayIndex]);
  const { data, isLoading, isError, refetch } = useGetCalendar(
    { date },
    { query: { refetchInterval: 30_000, refetchOnWindowFocus: true } as any },
  );

  const terrains = (data?.terrains ?? []).filter(
    (t) => filter === "all" || t.terrain.type === filter,
  );
  const times = useMemo(() => {
    const s = new Set<string>();
    terrains.forEach(({ slots }) =>
      slots.forEach((sl) => {
        if (clubDay(sl.startTime) === date) s.add(hhmm(sl.startTime));
      }),
    );
    return Array.from(s).sort();
  }, [terrains, date]);
  const slotAt = (t: CalendarTerrain, time: string) =>
    t.slots.find((s) => hhmm(s.startTime) === time && clubDay(s.startTime) === date);
  const rowIsPast = (time: string) => terrains.every((t) => slotAt(t, time)?.isPast ?? true);

  // Late evening: nothing left to book today, open tomorrow instead
  // (once, for players: staff still open today's past matches to collect cash)
  const autoAdvanced = useRef(false);
  const todayOver =
    !isAdmin && dayIndex === 0 && !!data && times.length > 0 && times.every((t) => rowIsPast(t));
  useEffect(() => {
    if (todayOver && !autoAdvanced.current) {
      autoAdvanced.current = true;
      setDayIndex(1);
    }
  }, [todayOver]);

  // Today: scroll the first upcoming row into view
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-upcoming='true']");
    if (el && scroller.current) scroller.current.scrollTop = Math.max(0, el.offsetTop - 64);
  }, [date, times.length]);

  // Keep an open dialog in sync with fresh data (another player joined, paid…)
  const live = (m: NonNullable<Modal>) => {
    const t = data?.terrains.find((x) => x.terrain.id === m.terrain.id);
    return t?.slots.find((s) => s.startTime === m.slot.startTime) ?? m.slot;
  };

  const open = (slot: CalendarSlot, terrain: Terrain) => {
    const st = slotState(slot);
    if (st === "past" && !slot.reservationId) return;
    if (!slot.reservationId) {
      if (!isSignedIn) {
        setLocation(`/sign-in?redirect=${encodeURIComponent("/terrains")}`);
        return;
      }
      setModal({ type: "book", slot, terrain });
    } else setModal({ type: "match", slot, terrain });
  };

  const legend: { state: SlotState; label: string }[] = [
    { state: "available", label: tx({ fr: "Libre", en: "Free", ar: "متاح" }) },
    { state: "partial", label: tx({ fr: "Places ouvertes", en: "Open spots", ar: "أماكن شاغرة" }) },
    { state: "mine", label: tx({ fr: "Mon match", en: "My match", ar: "مباراتي" }) },
    { state: "full", label: tx({ fr: "Complet", en: "Full", ar: "مكتمل" }) },
  ];
  const filters = [
    { id: "all" as const, label: tx({ fr: "Tous", en: "All", ar: "الكل" }) },
    { id: "indoor" as const, label: "Indoor" },
    { id: "outdoor" as const, label: "Outdoor" },
  ];
  const current = modal ? { ...modal, slot: live(modal) } : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Day strip */}
      <div
        role="group"
        aria-label={tx({ fr: "Jour", en: "Day", ar: "اليوم" })}
        className="hscroll -mx-4 gap-2 px-4 sm:mx-0 sm:px-0"
      >
        {days.map((d, i) => {
          const on = i === dayIndex;
          return (
            <button
              key={dayKey(d)}
              type="button"
              onClick={() => setDayIndex(i)}
              aria-pressed={on}
              aria-label={format(d, "EEEE d MMMM", { locale })}
              className={cn(
                "flex h-[74px] w-[64px] flex-col items-center justify-center gap-0.5 rounded-[22px] border-2 transition-[background-color,border-color,color,transform] active:scale-95",
                on
                  ? "border-ink bg-ink text-white"
                  : "border-[#E4E8F7] bg-card hover:border-[#C6CEF6]",
              )}
            >
              <span className="text-xs font-bold capitalize opacity-80">
                {i === 0
                  ? tx({ fr: "Auj.", en: "Today", ar: "اليوم" })
                  : format(d, "EEE", { locale })}
              </span>
              <span className="disp text-2xl">{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={tx({ fr: "Type de terrain", en: "Court type", ar: "نوع الملعب" })}
          className="flex rounded-full bg-card p-1 shadow-sm"
        >
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className="pill-tab h-10"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ul className="-mx-4 m-0 flex list-none gap-x-4 gap-y-2 overflow-x-auto whitespace-nowrap px-4 pb-1 text-[13px] font-semibold text-muted-foreground sm:mx-0 sm:flex-wrap sm:px-0">
          {legend.map((l) => (
            <li key={l.state} className="flex items-center gap-2">
              <span className="slot size-4 rounded-md" data-state={l.state} />
              {l.label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Globe className="size-4 text-[#7B5CF0]" />
            Open match
          </li>
          <li className="flex items-center gap-2">
            <Zap className="size-4 text-[#B1452A]" />
            {tx({ fr: "Heures pleines", en: "Peak", ar: "ذروة" })}
          </li>
        </ul>
      </div>

      {isError ? (
        <EmptyState
          icon={<CalendarX2 className="size-7" />}
          title={tx({
            fr: "Le planning n'a pas chargé",
            en: "The schedule didn't load",
            ar: "لم يتم تحميل الجدول",
          })}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {tx({ fr: "Réessayer", en: "Try again", ar: "أعد المحاولة" })}
            </Button>
          }
        />
      ) : isLoading ? (
        <div className="grid grid-cols-4 gap-2" aria-busy="true">
          {Array.from({ length: 16 }, (_, i) => (
            <Skeleton key={i} className="h-[62px] w-full" />
          ))}
        </div>
      ) : terrains.length === 0 || times.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 className="size-7" />}
          title={tx({
            fr: "Aucun créneau ce jour-là",
            en: "No slots that day",
            ar: "لا مواعيد في هذا اليوم",
          })}
          text={tx({
            fr: "Essayez un autre jour ou un autre type de terrain.",
            en: "Try another day or court type.",
            ar: "جرّب يومًا أو نوع ملعب آخر.",
          })}
        />
      ) : (
        <>
          {/* Courts as columns, times as rows. Both headers stay visible while scrolling. */}
          <div
            ref={scroller}
            className="-mx-4 max-h-[min(72vh,760px)] overflow-auto overscroll-x-contain bg-card shadow-sm sm:mx-0 sm:rounded-[28px]"
          >
            <table
              className="w-full table-fixed border-separate border-spacing-1.5 p-1.5"
              style={{ minWidth: 64 + terrains.length * 104 }}
            >
              <caption className="sr-only">
                {tx({ fr: "Disponibilités", en: "Availability", ar: "المواعيد المتاحة" })}{" "}
                {format(days[dayIndex], "PPPP", { locale })}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky start-0 top-0 z-30 w-[52px] bg-card" />
                  {terrains.map((ct) => (
                    <th
                      key={ct.terrain.id}
                      scope="col"
                      className="sticky top-0 z-20 bg-card px-1 pb-1.5 pt-2 text-start align-bottom"
                    >
                      <span className="flex flex-col">
                        <span className="truncate text-[15px] font-extrabold leading-tight">
                          {ct.terrain.name}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          {ct.terrain.type === "outdoor" ? (
                            <Sun className="size-3" />
                          ) : (
                            <Warehouse className="size-3" />
                          )}
                          {ct.terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((time, row) => {
                  const past = rowIsPast(time);
                  const firstUpcoming = !past && (row === 0 || rowIsPast(times[row - 1]));
                  return (
                    <tr key={time} data-upcoming={firstUpcoming || undefined}>
                      <th
                        scope="row"
                        className="sticky start-0 z-10 bg-card pe-1 text-start align-middle"
                      >
                        <span
                          className={cn(
                            "text-[13px] font-extrabold",
                            past ? "text-[#A3AACB]" : "text-ink",
                          )}
                          dir="ltr"
                        >
                          {time}
                        </span>
                      </th>
                      {terrains.map((ct) => {
                        const slot = slotAt(ct, time);
                        if (!slot)
                          return (
                            <td key={ct.terrain.id}>
                              <span className="block h-[62px] rounded-2xl bg-secondary/40" />
                            </td>
                          );
                        const st = slotState(slot);
                        const clickable = st !== "past" || !!slot.reservationId;
                        const label = cellLabel(st, slot, isAdmin, tx);
                        return (
                          <td key={ct.terrain.id}>
                            <button
                              type="button"
                              className={cn(
                                "slot flex h-[62px] w-full flex-col justify-center px-2",
                                slot.isPast && st !== "past" && "opacity-60",
                              )}
                              data-state={st}
                              data-public={slot.isPublic || undefined}
                              disabled={!clickable}
                              onClick={() => open(slot, ct.terrain)}
                              aria-label={`${ct.terrain.name} ${time}: ${label || tx({ fr: "passé", en: "past", ar: "انتهى" })}${st === "available" ? `, ${tokens(slot.tokensPerSpot * 4)}` : ""}`}
                            >
                              {st !== "past" || slot.reservationId ? (
                                <>
                                  <span className="flex items-center justify-between gap-1 text-[13px] font-extrabold leading-tight">
                                    <span className="truncate">{label}</span>
                                    {slot.isPublic && st !== "mine" ? (
                                      <Globe className="size-3.5 shrink-0 text-[#7B5CF0]" />
                                    ) : slot.isPeak && st === "available" ? (
                                      <Zap className="size-3.5 shrink-0 text-[#B1452A]" />
                                    ) : null}
                                  </span>
                                  {st === "available" ? (
                                    <span className="mt-0.5 text-[11px] font-semibold opacity-75">
                                      {tokens(slot.tokensPerSpot * 4)}
                                    </span>
                                  ) : st !== "blocked" ? (
                                    <span className="mt-1.5 flex gap-0.5" aria-hidden="true">
                                      {Array.from({ length: slot.totalSpots }, (_, k) => (
                                        <span
                                          key={k}
                                          className={cn(
                                            "h-1.5 flex-1 rounded-full",
                                            k < slot.filledSpots
                                              ? st === "mine"
                                                ? "bg-white"
                                                : "bg-ink/60"
                                              : st === "mine"
                                                ? "bg-white/35"
                                                : "bg-ink/12",
                                          )}
                                        />
                                      ))}
                                    </span>
                                  ) : null}
                                </>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
            <LiveDot color="#1F9D5B" />
            {tx({
              fr: "Disponibilités mises à jour en direct.",
              en: "Availability updates live.",
              ar: "يتم تحديث المواعيد مباشرة.",
            })}
            {terrains.length > 3 && (
              <span className="sm:hidden">
                {tx({
                  fr: " Glissez pour voir tous les terrains.",
                  en: " Swipe to see every court.",
                  ar: " اسحب لرؤية كل الملاعب.",
                })}
              </span>
            )}
          </p>
        </>
      )}

      <Dialog open={!!current} onOpenChange={(o) => !o && setModal(null)}>
        {current && (
          <DialogContent className="max-w-[540px]">
            <DialogHero terrain={current.terrain} slot={current.slot} />
            {current.type === "book" ? (
              <BookDialog
                slot={current.slot}
                terrain={current.terrain}
                isAdmin={isAdmin}
                onClose={() => setModal(null)}
              />
            ) : (
              <MatchDialog
                slot={current.slot}
                terrain={current.terrain}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onClose={() => setModal(null)}
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
