import { useState } from "react";
import {
  useJoinSession,
  useMakeSessionPublic,
  useMakeSessionPrivate,
  useLeaveSession,
  useUpdatePlayerPayment,
  useCancelReservation,
  useAddPlayer,
  useRemovePlayer,
} from "@workspace/api-client-react";
import type { CalendarSlot, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  CheckCircleIcon,
  CoinsIcon,
  GlobeIcon,
  LockSimpleIcon,
  MoneyIcon,
  PhoneIcon,
  SignOutIcon,
  UserPlusIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useTx } from "@/lib/i18n";
import { inviteShareText, plural, tokensLabel } from "@/lib/labels";
import { Avatar } from "@/components/smash/primitives";
import { PaymentBadge } from "@/components/smash/payment-badge";
import { InvitePanel } from "@/components/smash/invite-panel";
import { MemberPicker } from "@/components/smash/member-picker";
import { useClubRules } from "@/hooks/use-club-rules";
import { useRefreshBookings, type Terrain } from "./shared";
import { apiErrorText } from "@/lib/api-errors";

/** A booked slot: who plays, join / leave / invite, and the admin's desk actions. */
export function MatchDialog({
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
  const rules = useClubRules();
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
  const perSpot = slot.tokensPerSpot ?? rules.tokenCostPlayer;
  const meInMatch = slot.players.some((p) => p.userId != null && p.userId === currentUserId);
  const canJoin =
    rules.openMatchesEnabled &&
    !slot.isMine &&
    !full &&
    slot.openSpots > 0 &&
    !slot.isPast &&
    !slot.isBlocked;
  const canInvite =
    rules.invitationsEnabled &&
    !slot.isPast &&
    (slot.isOrganizer || (!full && meInMatch)) &&
    (full ? slot.players.length < slot.totalSpots : slot.openSpots > 0);
  const canLeave = meInMatch && !slot.isPast && !(full && slot.isOrganizer);
  const canCancel = !slot.isPast && slot.isOrganizer;
  const fail = (title: string) => (e: unknown) =>
    toast({ title, description: apiErrorText(e, tx), variant: "destructive" });
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
                fr: `${tokensLabel(perSpot)} ${plural(perSpot, "débité", "débités")}.`,
                en: `${tokensLabel(perSpot)} charged.`,
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
                  fr: `${slot.openSpots} ${plural(slot.openSpots, "place libre", "places libres")}`,
                  en: `${slot.openSpots} ${plural(slot.openSpots, "open spot", "open spots")}`,
                  ar: `${slot.openSpots} مكان شاغر`,
                })
              : tx({ fr: "Complet", en: "Full", ar: "مكتمل" })}
          </Badge>
        )}
        {slot.isPublic && (
          <Badge variant="outline" className="gap-1">
            <GlobeIcon className="size-3" />
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
              <PhoneIcon className="size-3.5" />
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
                    loading={updatePayment.isPending && updatePayment.variables?.playerId === p.id}
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
                          onError: fail(
                            tx({
                              fr: "Action impossible",
                              en: "Couldn't do that",
                              ar: "تعذر تنفيذ الإجراء",
                            }),
                          ),
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
                          onSuccess: (removed) =>
                            done(
                              tx({
                                fr: "Joueur retiré",
                                en: "Player removed",
                                ar: "تمت إزالة اللاعب",
                              }),
                              removed.freed
                                ? tx({
                                    fr: "Plus aucun joueur : le créneau est de nouveau libre.",
                                    en: "No player left: the slot is free again.",
                                    ar: "لا لاعبين: الموعد متاح مجددًا.",
                                  })
                                : undefined,
                              removed.freed,
                            )(),
                          onError: fail(
                            tx({
                              fr: "Action impossible",
                              en: "Couldn't do that",
                              ar: "تعذر تنفيذ الإجراء",
                            }),
                          ),
                        },
                      )
                    }
                  >
                    <XIcon className="size-4" />
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
                  <UserPlusIcon className="size-4" />
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
              <CoinsIcon />
              {tx({
                fr: `Payer ${tokensLabel(perSpot)}`,
                en: `Pay ${tokensLabel(perSpot)}`,
                ar: `ادفع ${perSpot} رصيد`,
              })}
            </Button>
            {rules.cashPaymentEnabled && (
              <Button
                variant="outline"
                onClick={() => join("cash_club")}
                disabled={joinSession.isPending}
              >
                <MoneyIcon />
                {tx({ fr: "Payer au club", en: "Pay at the club", ar: "الدفع في النادي" })}
              </Button>
            )}
          </div>
        </div>
      )}

      {canInvite &&
        (showInvite ? (
          <InvitePanel
            reservationId={id}
            free={full}
            shareText={inviteShareText(tx, terrain.name, slot.startTime)}
          />
        ) : (
          <Button variant="dark" onClick={() => setShowInvite(true)}>
            <UserPlusIcon />
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
              loading={addPlayer.isPending}
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
                    onError: fail(
                      tx({
                        fr: "Action impossible",
                        en: "Couldn't do that",
                        ar: "تعذر تنفيذ الإجراء",
                      }),
                    ),
                  },
                )
              }
            >
              <UserPlusIcon />
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
            loading={makePublic.isPending || makePrivate.isPending}
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
                  onError: fail(
                    tx({
                      fr: "Action impossible",
                      en: "Couldn't do that",
                      ar: "تعذر تنفيذ الإجراء",
                    }),
                  ),
                },
              )
            }
          >
            {slot.isPublic ? <LockSimpleIcon /> : <GlobeIcon />}
            {slot.isPublic
              ? tx({ fr: "Rendre privé", en: "Make private", ar: "اجعلها خاصة" })
              : tx({ fr: "Ouvrir au club", en: "Open to the club", ar: "افتحها للنادي" })}
          </Button>
        )}
        {canLeave && (
          <Button
            variant="outline-destructive"
            disabled={leaveSession.isPending}
            loading={leaveSession.isPending}
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
            <SignOutIcon />
            {tx({ fr: "Quitter", en: "Leave", ar: "مغادرة" })}
          </Button>
        )}
        {(canCancel || (isAdmin && !slot.isPast)) &&
          (confirmCancel ? (
            <Button
              variant="destructive"
              disabled={cancelReservation.isPending}
              loading={cancelReservation.isPending}
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
              <CheckCircleIcon />
              {tx({
                fr: "Confirmer l'annulation",
                en: "Confirm cancellation",
                ar: "تأكيد الإلغاء",
              })}
            </Button>
          ) : (
            <Button variant="outline-destructive" onClick={() => setConfirmCancel(true)}>
              <XIcon />
              {slot.isBlocked
                ? tx({ fr: "Débloquer", en: "Unblock", ar: "إلغاء الحجب" })
                : tx({ fr: "Annuler la réservation", en: "Cancel booking", ar: "إلغاء الحجز" })}
            </Button>
          ))}
      </div>
    </div>
  );
}
