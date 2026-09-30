import React, { useEffect, useMemo, useState } from "react";
import { format, addDays, isSameDay } from "date-fns";
import {
  useGetCalendar,
  useCreateReservation,
  useJoinSession,
  useCreateInvite,
  useMakeSessionPublic,
  useMakeSessionPrivate,
  getCalendarQueryKey,
  getListReservationsQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
  useLeaveSession,
  useUpdatePlayerPayment,
  getOpenMatchesQueryKey,
  useCancelReservation,
  useGetTokenBalance,
} from "@workspace/api-client-react";
import type { CalendarSlot, CalendarTerrain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users,
  Coins,
  Link2,
  Globe,
  Lock,
  CheckCircle2,
  Clock3,
  X,
  Copy,
  Check,
  ShieldAlert,
  UserPlus,
  LogOut,
  CalendarX2,
  Sun,
  Warehouse,
  MessageCircle,
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/services/api";
import { useTx, useDateLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Avatar, CourtLines, EmptyState, LiveDot } from "@/components/smash/primitives";
import { CLUB } from "@/config/club";

type Terrain = CalendarTerrain["terrain"];
type BookingModalState =
  | { type: "book"; slot: CalendarSlot; terrain: Terrain }
  | { type: "session"; slot: CalendarSlot; terrain: Terrain }
  | null;

type SlotState = "available" | "partial" | "full" | "mine" | "past";

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const hhmm = (iso: string) => format(new Date(iso), "HH:mm");

function slotState(slot: CalendarSlot, currentUserId: number | null): SlotState {
  if (slot.status === "past") return "past";
  if (currentUserId != null && slot.players.some((p) => p.userId === currentUserId)) return "mine";
  if (slot.status === "available") return "available";
  if (slot.status === "full") return "full";
  return "partial";
}

/* ───────────────────────────── Booking / session dialog ───────────────────────────── */

function BookingModal({
  modal,
  onClose,
  currentUserId,
  isAdmin,
}: {
  modal: BookingModalState;
  onClose: () => void;
  currentUserId: number | null;
  isAdmin: boolean;
}) {
  const tx = useTx();
  const locale = useDateLocale();
  const [bookingMode, setBookingMode] = useState<"full_court" | "own_spot">("full_court");
  const [isPublic, setIsPublic] = useState(false);
  const [publicDescription, setPublicDescription] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const { toast } = useToast();
  const qc = useQueryClient();
  const { isSignedIn } = useAuth();
  const { data: balance } = useGetTokenBalance({ query: { enabled: isSignedIn } as any });

  const createReservation = useCreateReservation();
  const joinSession = useJoinSession();
  const leaveSession = useLeaveSession();
  const createInvite = useCreateInvite();
  const makePublic = useMakeSessionPublic();
  const makePrivate = useMakeSessionPrivate();
  const updatePlayerPayment = useUpdatePlayerPayment();
  const cancelReservation = useCancelReservation();

  useEffect(() => {
    setBookingMode("full_court");
    setIsPublic(false);
    setPublicDescription("");
    setInviteUrl(null);
  }, [modal]);

  if (!modal) return null;
  const { slot, terrain } = modal;
  const when = `${format(new Date(slot.startTime), "EEEE d MMMM", { locale })}`;
  const range = `${hhmm(slot.startTime)} – ${hhmm(slot.endTime)}`;
  const err = (e: any, fallback: string) =>
    toast({
      title: tx({ fr: "Oups", en: "Oops", ar: "عذرًا" }),
      description: e?.data?.error ?? fallback,
      variant: "destructive",
    });

  const invalidateAll = () => {
    const dateStr = dayKey(new Date(slot.startTime));
    qc.invalidateQueries({ queryKey: getCalendarQueryKey({ date: dateStr }) });
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
    qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
  };

  const userIsInSession = slot.players.some((p) => p.userId === currentUserId);
  const cost = bookingMode === "own_spot" ? CLUB.tokensOwnSpot : CLUB.tokensFullCourt;
  const bal = balance?.balance ?? null;
  const short = bal !== null && bal < cost;

  const handleBook = () => {
    createReservation.mutate(
      {
        data: {
          terrainId: terrain.id,
          startTime: slot.startTime,
          bookingMode,
          isPublic: bookingMode === "own_spot" ? isPublic : false,
          publicDescription: bookingMode === "own_spot" && isPublic ? publicDescription : undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "C'est réservé !", en: "You're booked!", ar: "تم الحجز!" }),
            description: `${terrain.name}, ${when}, ${range}`,
          });
          invalidateAll();
          onClose();
        },
        onError: (e: any) =>
          err(
            e,
            tx({ fr: "Erreur lors de la réservation", en: "Booking failed", ar: "فشل الحجز" }),
          ),
      },
    );
  };
  const handleJoin = () => {
    if (!slot.reservationId) return;
    joinSession.mutate(
      { id: slot.reservationId },
      {
        onSuccess: () => {
          toast({
            title: tx({
              fr: "Vous êtes dans le match !",
              en: "You're in the match!",
              ar: "أنت في المباراة!",
            }),
            description: tx({
              fr: "1 token débité.",
              en: "1 token charged.",
              ar: "تم خصم رصيد واحد.",
            }),
          });
          invalidateAll();
          onClose();
        },
        onError: (e: any) =>
          err(e, tx({ fr: "Impossible de rejoindre", en: "Couldn't join", ar: "تعذر الانضمام" })),
      },
    );
  };
  const handleLeave = () => {
    if (!slot.reservationId) return;
    leaveSession.mutate(
      { id: slot.reservationId },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Place libérée", en: "Spot released", ar: "تم تحرير المكان" }),
            description: tx({
              fr: "Token remboursé.",
              en: "Token refunded.",
              ar: "تم استرجاع الرصيد.",
            }),
          });
          invalidateAll();
          onClose();
        },
        onError: (e: any) =>
          err(e, tx({ fr: "Impossible de quitter", en: "Couldn't leave", ar: "تعذر المغادرة" })),
      },
    );
  };
  const handleInvite = () => {
    if (!slot.reservationId) return;
    createInvite.mutate(
      { id: slot.reservationId },
      {
        onSuccess: (data: any) => {
          setInviteUrl(
            data.inviteUrl ||
              `${window.location.origin}/join/${data.token ?? data.invite?.inviteToken}`,
          );
        },
        onError: () =>
          err(
            null,
            tx({
              fr: "Impossible de créer l'invitation",
              en: "Couldn't create the invite",
              ar: "تعذر إنشاء الدعوة",
            }),
          ),
      },
    );
  };
  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    });
  };
  const handleTogglePublic = () => {
    if (!slot.reservationId) return;
    const m = slot.isPublic ? makePrivate : makePublic;
    m.mutate(
      { id: slot.reservationId },
      {
        onSuccess: () => {
          toast({
            title: slot.isPublic
              ? tx({ fr: "Session privée", en: "Session is private", ar: "الجلسة خاصة" })
              : tx({ fr: "Session publique", en: "Session is public", ar: "الجلسة عامة" }),
          });
          invalidateAll();
          onClose();
        },
        onError: () => err(null, "Erreur"),
      },
    );
  };
  const handleAdminPayment = (playerId: number, paymentStatus: string) => {
    if (!slot.reservationId) return;
    updatePlayerPayment.mutate(
      { reservationId: slot.reservationId, playerId, paymentStatus } as any,
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Paiement mis à jour", en: "Payment updated", ar: "تم تحديث الدفع" }),
          });
          invalidateAll();
        },
        onError: () => err(null, "Erreur"),
      },
    );
  };
  const handleAdminCancel = () => {
    if (!slot.reservationId) return;
    cancelReservation.mutate(
      { id: slot.reservationId },
      {
        onSuccess: () => {
          toast({
            title: tx({
              fr: "Réservation annulée",
              en: "Reservation cancelled",
              ar: "تم إلغاء الحجز",
            }),
          });
          invalidateAll();
          onClose();
        },
        onError: (e: any) =>
          err(e, tx({ fr: "Impossible d'annuler", en: "Couldn't cancel", ar: "تعذر الإلغاء" })),
      },
    );
  };
  const handleAdminAssignPlayer = async () => {
    if (!slot.reservationId || !assignUserId.trim()) return;
    setIsAssigning(true);
    try {
      const res = await apiFetch(`/api/reservations/${slot.reservationId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: parseInt(assignUserId),
          paymentType: "cash",
          paymentStatus: "pending",
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        err({ data: e }, "Impossible d'assigner");
        return;
      }
      toast({ title: tx({ fr: "Joueur ajouté", en: "Player added", ar: "تمت إضافة اللاعب" }) });
      setAssignUserId("");
      invalidateAll();
    } catch {
      err(null, tx({ fr: "Erreur réseau", en: "Network error", ar: "خطأ في الشبكة" }));
    } finally {
      setIsAssigning(false);
    }
  };
  const handleAdminBlockSlot = async () => {
    try {
      const res = await apiFetch("/api/admin/slots/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terrainId: terrain.id,
          startTime: slot.startTime,
          reason: "Maintenance",
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        err({ data: e }, "Impossible de bloquer");
        return;
      }
      toast({
        title: tx({
          fr: "Créneau bloqué pour maintenance",
          en: "Slot blocked for maintenance",
          ar: "تم حجب الموعد للصيانة",
        }),
      });
      invalidateAll();
      onClose();
    } catch {
      err(null, tx({ fr: "Erreur réseau", en: "Network error", ar: "خطأ في الشبكة" }));
    }
  };

  const isLoading =
    createReservation.isPending ||
    joinSession.isPending ||
    leaveSession.isPending ||
    cancelReservation.isPending;
  const typeIcon =
    terrain.type === "outdoor" ? <Sun className="size-4" /> : <Warehouse className="size-4" />;

  const header = (
    <div className="on-dark relative -mx-6 -mt-6 overflow-hidden rounded-t-[32px] bg-night px-6 pb-6 pt-7 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute -end-10 -top-6 h-[120px] w-[220px] rotate-[-9deg] rounded-lg border-[3px] border-white/15 bg-court/40"
      >
        <CourtLines />
      </div>
      <DialogHeader className="relative text-start">
        <span className="label flex items-center gap-2 text-ball">
          {typeIcon}
          {terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
        </span>
        <DialogTitle className="text-[32px] leading-none text-white">{terrain.name}</DialogTitle>
        <DialogDescription className="text-base capitalize text-soft-d">
          {when} ·{" "}
          <span className="font-bold text-white" dir="ltr">
            {range}
          </span>
        </DialogDescription>
      </DialogHeader>
    </div>
  );

  if (modal.type === "book") {
    const modes = [
      {
        id: "full_court" as const,
        title: tx({ fr: "Terrain complet", en: "Full court", ar: "ملعب كامل" }),
        text: tx({
          fr: "Les 4 places pour vous et vos amis",
          en: "All 4 spots for you and friends",
          ar: "الأماكن الأربعة لك ولأصدقائك",
        }),
        cost: CLUB.tokensFullCourt,
      },
      {
        id: "own_spot" as const,
        title: tx({ fr: "Ma place", en: "Just my spot", ar: "مكاني فقط" }),
        text: tx({
          fr: "1 place, 3 ouvertes à d'autres",
          en: "1 spot, 3 open to others",
          ar: "مكان واحد و3 مفتوحة",
        }),
        cost: CLUB.tokensOwnSpot,
      },
    ];
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-[520px]">
          {header}
          <div className="flex flex-col gap-5">
            <div
              role="radiogroup"
              aria-label={tx({ fr: "Mode de réservation", en: "Booking mode", ar: "نوع الحجز" })}
              className="grid grid-cols-2 gap-3"
            >
              {modes.map((m) => {
                const on = bookingMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setBookingMode(m.id)}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-[22px] border-[3px] p-4 text-start transition-[border-color,background-color,transform] active:scale-[.98]",
                      on ? "border-court bg-[#EEF1FF]" : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-extrabold">{m.title}</span>
                      <span
                        className={cn(
                          "size-5 rounded-full border-[3px]",
                          on ? "border-court bg-court" : "border-[#C6CEF6]",
                        )}
                      />
                    </span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{m.text}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-lg font-extrabold text-court">
                      <Coins className="size-4" />
                      {m.cost} token{m.cost > 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {bookingMode === "own_spot" && (
              <div className="flex flex-col gap-3 rounded-[22px] bg-secondary p-4">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="flex flex-col">
                    <span className="font-bold">
                      {tx({
                        fr: "En faire un open match",
                        en: "Make it an open match",
                        ar: "اجعلها مباراة مفتوحة",
                      })}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {tx({
                        fr: "Les joueurs du club pourront prendre les places libres.",
                        en: "Club players can take the open spots.",
                        ar: "يمكن لأعضاء النادي أخذ الأماكن الشاغرة.",
                      })}
                    </span>
                  </span>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </label>
                {isPublic && (
                  <Input
                    value={publicDescription}
                    onChange={(e) => setPublicDescription(e.target.value)}
                    placeholder={tx({
                      fr: "Ex : niveau 3, débutants bienvenus",
                      en: "e.g. level 3, beginners welcome",
                      ar: "مثال: مستوى 3، المبتدئون مرحب بهم",
                    })}
                  />
                )}
              </div>
            )}

            <dl className="m-0 flex flex-col gap-2.5 rounded-[22px] border border-[#E4E8F7] p-4 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {tx({ fr: "Durée", en: "Duration", ar: "المدة" })}
                </dt>
                <dd className="m-0 font-bold">{CLUB.slotMinutes} min</dd>
              </div>
              {terrain.pricePerPerson ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {tx({ fr: "Prix par joueur", en: "Price per player", ar: "السعر للاعب" })}
                  </dt>
                  <dd className="m-0 font-bold">
                    {terrain.pricePerPerson} {CLUB.currency}
                  </dd>
                </div>
              ) : null}
              {bal !== null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {tx({ fr: "Votre solde", en: "Your balance", ar: "رصيدك" })}
                  </dt>
                  <dd className={cn("m-0 font-bold", short && "text-destructive")}>{bal} tokens</dd>
                </div>
              )}
              <div className="flex items-end justify-between border-t border-[#E4E8F7] pt-3">
                <dt className="font-bold">Total</dt>
                <dd className="disp m-0 text-3xl">
                  {cost} token{cost > 1 ? "s" : ""}
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
                  fr: "Solde insuffisant. Rechargez vos tokens à l'accueil du club.",
                  en: "Not enough tokens. Top up at the club front desk.",
                  ar: "رصيد غير كافٍ. اشحن رصيدك في استقبال النادي.",
                })}
              </p>
            )}

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={isLoading}>
                {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
              </Button>
              <Button className="flex-[1.4]" onClick={handleBook} disabled={isLoading}>
                {isLoading
                  ? tx({ fr: "Réservation…", en: "Booking…", ar: "جارٍ الحجز…" })
                  : tx({ fr: "Confirmer", en: "Confirm booking", ar: "تأكيد الحجز" })}
              </Button>
            </div>
            {isAdmin && (
              <Button
                variant="outline-destructive"
                onClick={handleAdminBlockSlot}
                disabled={isLoading}
              >
                <CalendarX2 />
                {tx({
                  fr: "Bloquer pour maintenance",
                  en: "Block for maintenance",
                  ar: "حجب للصيانة",
                })}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* Session details */
  const canJoin = !userIsInSession && slot.openSpots > 0 && slot.bookingMode === "own_spot";
  const shareText = inviteUrl
    ? `${tx({ fr: "Rejoins mon match de padel", en: "Join my padel match", ar: "انضم إلى مباراتي" })}: ${terrain.name}, ${when} ${range}. ${inviteUrl}`
    : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        {header}
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={slot.status === "full" ? "muted" : "lime"}>
              {slot.status === "full"
                ? tx({ fr: "Complet", en: "Full", ar: "مكتمل" })
                : tx({
                    fr: `${slot.openSpots} place(s) libre(s)`,
                    en: `${slot.openSpots} open spot(s)`,
                    ar: `${slot.openSpots} مكان شاغر`,
                  })}
            </Badge>
            {slot.isPublic && (
              <Badge variant="outline" className="gap-1">
                <Globe className="size-3" />
                Open match
              </Badge>
            )}
            {userIsInSession && (
              <Badge>{tx({ fr: "Vous jouez", en: "You're playing", ar: "أنت تلعب" })}</Badge>
            )}
          </div>
          {slot.publicDescription && (
            <p className="m-0 rounded-2xl bg-secondary px-4 py-3 text-[15px] italic text-body">
              “{slot.publicDescription}”
            </p>
          )}

          <div className="flex flex-col gap-2">
            <span className="label text-muted-foreground">
              {tx({ fr: "Joueurs", en: "Players", ar: "اللاعبون" })} · {slot.filledSpots}/
              {slot.totalSpots}
            </span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {slot.players.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl bg-secondary/70 p-2.5 pe-3"
                >
                  <Avatar name={p.name} index={i} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">
                      {p.name}
                      {p.userId === currentUserId && (
                        <span className="ms-2 text-xs font-extrabold text-court">
                          ({tx({ fr: "vous", en: "you", ar: "أنت" })})
                        </span>
                      )}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {p.paymentType ?? "—"}
                    </span>
                  </span>
                  {p.paymentStatus === "paid" ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      {tx({ fr: "Payé", en: "Paid", ar: "مدفوع" })}
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1">
                      <Clock3 className="size-3" />
                      {tx({ fr: "En attente", en: "Pending", ar: "قيد الانتظار" })}
                    </Badge>
                  )}
                  {isAdmin && p.paymentStatus === "pending" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => handleAdminPayment(p.id, "paid")}
                      disabled={updatePlayerPayment.isPending}
                    >
                      {tx({ fr: "Marquer payé", en: "Mark paid", ar: "تعليم كمدفوع" })}
                    </Button>
                  )}
                  {isAdmin && p.paymentType === "token" && p.paymentStatus === "paid" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => handleAdminPayment(p.id, "pending")}
                      disabled={updatePlayerPayment.isPending}
                      aria-label={tx({
                        fr: "Remettre en attente",
                        en: "Set back to pending",
                        ar: "إرجاع إلى الانتظار",
                      })}
                    >
                      ···
                    </Button>
                  )}
                </li>
              ))}
              {Array.from({ length: slot.openSpots }, (_, i) => (
                <li
                  key={`open-${i}`}
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

          <div className="flex flex-wrap gap-2.5">
            {canJoin && (
              <Button className="flex-1" onClick={handleJoin} disabled={isLoading}>
                <Coins />
                {tx({ fr: "Rejoindre · 1 token", en: "Join · 1 token", ar: "انضم · رصيد واحد" })}
              </Button>
            )}
            {userIsInSession && (
              <>
                <Button
                  variant="dark"
                  className="flex-1"
                  onClick={handleInvite}
                  disabled={createInvite.isPending}
                >
                  <Link2 />
                  {tx({ fr: "Inviter des amis", en: "Invite friends", ar: "ادعُ أصدقاءك" })}
                </Button>
                <Button variant="outline-destructive" onClick={handleLeave} disabled={isLoading}>
                  <LogOut />
                  {tx({ fr: "Quitter", en: "Leave", ar: "مغادرة" })}
                </Button>
              </>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                onClick={handleTogglePublic}
                disabled={makePublic.isPending || makePrivate.isPending}
              >
                {slot.isPublic ? (
                  <>
                    <Lock />
                    {tx({ fr: "Rendre privé", en: "Make private", ar: "اجعلها خاصة" })}
                  </>
                ) : (
                  <>
                    <Globe />
                    {tx({ fr: "Rendre public", en: "Make public", ar: "اجعلها عامة" })}
                  </>
                )}
              </Button>
            )}
            {isAdmin && slot.reservationId && (
              <Button
                variant="outline-destructive"
                onClick={handleAdminCancel}
                disabled={isLoading}
              >
                <X />
                {tx({ fr: "Annuler la réservation", en: "Cancel booking", ar: "إلغاء الحجز" })}
              </Button>
            )}
          </div>

          {inviteUrl && (
            <div className="flex flex-col gap-3 rounded-[22px] bg-ball p-4 text-night">
              <span className="font-extrabold">
                {tx({
                  fr: "Lien d'invitation prêt",
                  en: "Invite link ready",
                  ar: "رابط الدعوة جاهز",
                })}
              </span>
              <code className="truncate rounded-xl bg-white/70 px-3 py-2 text-xs" dir="ltr">
                {inviteUrl}
              </code>
              <div className="flex gap-2">
                <Button size="sm" variant="dark" onClick={copyInvite}>
                  {copiedInvite ? (
                    <>
                      <Check />
                      {tx({ fr: "Copié", en: "Copied", ar: "تم النسخ" })}
                    </>
                  ) : (
                    <>
                      <Copy />
                      {tx({ fr: "Copier", en: "Copy", ar: "نسخ" })}
                    </>
                  )}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          )}

          {isAdmin &&
            slot.openSpots > 0 &&
            slot.bookingMode !== "full_court" &&
            slot.reservationId && (
              <div className="flex flex-col gap-2 border-t border-[#E4E8F7] pt-4">
                <span className="label text-muted-foreground">
                  {tx({
                    fr: "Ajouter un joueur (admin)",
                    en: "Add a player (admin)",
                    ar: "إضافة لاعب (مسؤول)",
                  })}
                </span>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="User ID"
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                  />
                  <Button
                    onClick={handleAdminAssignPlayer}
                    disabled={isAssigning || !assignUserId.trim()}
                  >
                    <UserPlus />
                    {isAssigning ? "…" : tx({ fr: "Ajouter", en: "Add", ar: "إضافة" })}
                  </Button>
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Calendar ───────────────────────────── */

function slotLabel(state: SlotState, slot: CalendarSlot, tx: ReturnType<typeof useTx>) {
  switch (state) {
    case "available":
      return tx({ fr: "Libre", en: "Free", ar: "متاح" });
    case "mine":
      return tx({ fr: "Vous", en: "You", ar: "أنت" });
    case "full":
      return tx({ fr: "Complet", en: "Full", ar: "مكتمل" });
    case "partial":
      return `${slot.openSpots} ${tx({ fr: "pl.", en: "open", ar: "شاغر" })}`;
    default:
      return "";
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
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);
  const [dayIndex, setDayIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "indoor" | "outdoor">("all");
  const [mobileTime, setMobileTime] = useState<string | null>(null);
  const [modal, setModal] = useState<BookingModalState>(null);

  const date = dayKey(days[dayIndex]);
  const { data, isLoading, isError, refetch } = useGetCalendar(
    { date },
    { query: { refetchInterval: 60_000 } as any },
  );

  const terrains = (data?.terrains ?? []).filter(
    (t) => filter === "all" || t.terrain.type === filter,
  );
  const times = useMemo(() => {
    const s = new Set<string>();
    terrains.forEach(({ slots }) =>
      slots.forEach((sl) => {
        if (isSameDay(new Date(sl.startTime), days[dayIndex])) s.add(hhmm(sl.startTime));
      }),
    );
    return Array.from(s).sort();
  }, [terrains, days, dayIndex]);
  const slotAt = (t: CalendarTerrain, time: string) =>
    t.slots.find(
      (s) => hhmm(s.startTime) === time && isSameDay(new Date(s.startTime), days[dayIndex]),
    );

  const upcomingTimes = times.filter((time) =>
    terrains.some((t) => {
      const s = slotAt(t, time);
      return s && s.status !== "past";
    }),
  );
  const activeMobileTime =
    mobileTime && upcomingTimes.includes(mobileTime) ? mobileTime : (upcomingTimes[0] ?? null);
  const freeCount = (time: string) =>
    terrains.filter((t) => {
      const s = slotAt(t, time);
      return (
        s && (s.status === "available" || (s.status === "partial" && s.bookingMode === "own_spot"))
      );
    }).length;

  const open = (slot: CalendarSlot, terrain: Terrain) => {
    const st = slotState(slot, currentUserId);
    if (st === "past") return;
    if (st === "available") {
      if (!isSignedIn) {
        setLocation(`/sign-in?redirect=${encodeURIComponent("/terrains")}`);
        return;
      }
      setModal({ type: "book", slot, terrain });
    } else setModal({ type: "session", slot, terrain });
  };

  const legend: { state: SlotState; label: string }[] = [
    { state: "available", label: tx({ fr: "Libre", en: "Free", ar: "متاح" }) },
    { state: "partial", label: tx({ fr: "Places ouvertes", en: "Open spots", ar: "أماكن شاغرة" }) },
    { state: "mine", label: tx({ fr: "Votre match", en: "Your match", ar: "مباراتك" }) },
    { state: "full", label: tx({ fr: "Complet", en: "Full", ar: "مكتمل" }) },
  ];
  const filters = [
    { id: "all" as const, label: tx({ fr: "Tous", en: "All courts", ar: "الكل" }) },
    { id: "indoor" as const, label: "Indoor" },
    { id: "outdoor" as const, label: "Outdoor" },
  ];

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
              className={cn(
                "flex h-[74px] w-[68px] flex-col items-center justify-center gap-0.5 rounded-[22px] border-2 transition-[background-color,border-color,color,transform] active:scale-95",
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
        <ul className="m-0 hidden list-none flex-wrap gap-4 p-0 text-[13px] font-semibold text-muted-foreground md:flex">
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
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
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
          {/* Desktop: courts × times */}
          <div className="hidden overflow-hidden rounded-[28px] bg-card shadow-sm lg:block">
            <div className="overflow-x-auto p-5">
              <table className="w-full border-separate border-spacing-1.5">
                <caption className="sr-only">
                  {tx({ fr: "Disponibilités", en: "Availability", ar: "المواعيد المتاحة" })}{" "}
                  {format(days[dayIndex], "PPPP", { locale })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky start-0 z-10 w-[170px] bg-card" />
                    {times.map((time) => (
                      <th
                        key={time}
                        scope="col"
                        className="min-w-[78px] pb-1 text-center text-[13px] font-extrabold text-muted-foreground"
                        dir="ltr"
                      >
                        {time}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {terrains.map((ct) => (
                    <tr key={ct.terrain.id}>
                      <th
                        scope="row"
                        className="sticky start-0 z-10 bg-card pe-3 text-start align-middle"
                      >
                        <span className="flex flex-col">
                          <span className="text-base font-extrabold">{ct.terrain.name}</span>
                          <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                            {ct.terrain.type === "outdoor" ? (
                              <Sun className="size-3.5" />
                            ) : (
                              <Warehouse className="size-3.5" />
                            )}
                            {ct.terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
                            {ct.terrain.pricePerPerson
                              ? ` · ${ct.terrain.pricePerPerson} ${CLUB.currency}`
                              : ""}
                          </span>
                        </span>
                      </th>
                      {times.map((time) => {
                        const slot = slotAt(ct, time);
                        if (!slot)
                          return (
                            <td key={time}>
                              <span className="block h-[58px] rounded-2xl bg-secondary/40" />
                            </td>
                          );
                        const st = slotState(slot, currentUserId);
                        return (
                          <td key={time}>
                            <button
                              type="button"
                              className="slot flex h-[58px] w-full flex-col justify-center px-2.5"
                              data-state={st}
                              data-public={slot.isPublic || undefined}
                              disabled={st === "past"}
                              onClick={() => open(slot, ct.terrain)}
                              aria-label={`${ct.terrain.name} ${time}: ${st === "past" ? tx({ fr: "passé", en: "past", ar: "انتهى" }) : slotLabel(st, slot, tx)}`}
                            >
                              {st !== "past" && (
                                <>
                                  <span className="flex items-center justify-between text-[13px] font-extrabold">
                                    {slotLabel(st, slot, tx)}
                                    {slot.isPublic && st !== "mine" && (
                                      <Globe className="size-3.5 text-[#7B5CF0]" />
                                    )}
                                  </span>
                                  {st !== "available" && (
                                    <span className="mt-1 flex gap-0.5" aria-hidden="true">
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
                                  )}
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: time first, then courts */}
          <div className="flex flex-col gap-4 lg:hidden">
            {upcomingTimes.length === 0 ? (
              <EmptyState
                title={tx({ fr: "Journée terminée", en: "Day is over", ar: "انتهى اليوم" })}
                text={tx({
                  fr: "Choisissez demain dans la barre du dessus.",
                  en: "Pick tomorrow above.",
                  ar: "اختر الغد في الأعلى.",
                })}
              />
            ) : (
              <>
                <div
                  role="group"
                  aria-label={tx({ fr: "Heure", en: "Time", ar: "الوقت" })}
                  className="hscroll -mx-4 gap-2 px-4"
                >
                  {upcomingTimes.map((time) => {
                    const on = time === activeMobileTime;
                    const n = freeCount(time);
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setMobileTime(time)}
                        aria-pressed={on}
                        className={cn(
                          "flex h-[60px] min-w-[84px] flex-col items-center justify-center rounded-[18px] px-3 transition-colors",
                          on ? "bg-court text-white" : "bg-card",
                        )}
                      >
                        <span className="text-base font-extrabold" dir="ltr">
                          {time}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            on ? "text-white/80" : n ? "text-[#3E7A1E]" : "text-[#B1452A]",
                          )}
                        >
                          {n
                            ? tx({ fr: `${n} dispo`, en: `${n} free`, ar: `${n} متاح` })
                            : tx({ fr: "Complet", en: "Full", ar: "مكتمل" })}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {terrains.map((ct) => {
                    const slot = activeMobileTime ? slotAt(ct, activeMobileTime) : undefined;
                    if (!slot) return null;
                    const st = slotState(slot, currentUserId);
                    const free = st === "available";
                    return (
                      <li key={ct.terrain.id}>
                        <button
                          type="button"
                          onClick={() => open(slot, ct.terrain)}
                          disabled={st === "past"}
                          className={cn(
                            "flex w-full items-center gap-3.5 rounded-[24px] border-[3px] bg-card p-3 text-start transition-transform active:scale-[.98]",
                            st === "mine" ? "border-court" : "border-transparent",
                            st === "full" && "opacity-70",
                          )}
                        >
                          <span
                            className="relative h-[52px] w-[78px] shrink-0 rounded-lg border-2 border-white shadow-[0_0_0_1px_#E4E8F7]"
                            style={{
                              background: free
                                ? "var(--color-court)"
                                : st === "mine"
                                  ? "var(--color-ball)"
                                  : "var(--color-night-3)",
                            }}
                          >
                            <CourtLines thick={2} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[17px] font-extrabold">{ct.terrain.name}</span>
                            <span className="text-[13px] text-muted-foreground">
                              {ct.terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
                              {ct.terrain.pricePerPerson
                                ? ` · ${ct.terrain.pricePerPerson} ${CLUB.currency}`
                                : ""}
                            </span>
                          </span>
                          <span
                            className="slot flex h-9 items-center rounded-full px-3 text-[13px] font-extrabold"
                            data-state={st}
                            data-public={slot.isPublic || undefined}
                          >
                            {slotLabel(st, slot, tx)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
            <LiveDot color="#1F9D5B" />
            {tx({
              fr: "Mis à jour en direct toutes les minutes.",
              en: "Updates live every minute.",
              ar: "يتم التحديث كل دقيقة.",
            })}
          </p>
        </>
      )}

      <BookingModal
        modal={modal}
        onClose={() => setModal(null)}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
