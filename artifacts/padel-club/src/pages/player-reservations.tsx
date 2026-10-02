import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  useListReservations,
  useListUpcomingReservations,
  useCancelReservation,
  useLeaveSession,
  useGetMe,
  getListReservationsQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
  getOpenMatchesQueryKey,
} from "@workspace/api-client-react";
import type { Reservation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDotsIcon,
  CalendarPlusIcon,
  DownloadSimpleIcon,
  SignOutIcon,
  SpinnerIcon,
  UserCircleIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { PaymentBadge } from "@/components/smash/payment-badge";
import { InvitePanel } from "@/components/smash/invite-panel";
import { useToast } from "@/hooks/use-toast";
import { useI18n, useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clubTime, clubDate, clubDateTime } from "@/lib/club-time";
import { inviteShareText, playersLabel, plural, tokensLabel } from "@/lib/labels";
import { downloadIcs } from "@/lib/ics";
import { useClubRules } from "@/hooks/use-club-rules";
import { Avatar } from "@/components/smash/primitives";
import { apiErrorText } from "@/lib/api-errors";

function StatusBadge({ status, played }: { status: string; played?: boolean }) {
  const tx = useTx();
  if (status === "confirmed" && played)
    return <Badge variant="muted">{tx({ fr: "Joué", en: "Played", ar: "لُعبت" })}</Badge>;
  if (status === "confirmed")
    return <Badge variant="success">{tx({ fr: "Confirmé", en: "Confirmed", ar: "مؤكد" })}</Badge>;
  if (status === "cancelled")
    return <Badge variant="danger">{tx({ fr: "Annulé", en: "Cancelled", ar: "ملغى" })}</Badge>;
  return (
    <Badge variant="warning">{tx({ fr: "En attente", en: "Pending", ar: "قيد الانتظار" })}</Badge>
  );
}

function DateBlock({ date, dark }: { date: string; dark?: boolean }) {
  const { lang } = useI18n();
  return (
    <span
      className={cn(
        "flex size-[68px] shrink-0 flex-col items-center justify-center rounded-[20px]",
        dark ? "bg-night text-white" : "bg-mist",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-bold uppercase",
          dark ? "text-ball" : "text-muted-foreground",
        )}
      >
        {clubDate(date, lang, "month")}
      </span>
      <span className="disp text-[28px] leading-none">{clubDate(date, lang, "day")}</span>
    </span>
  );
}

const hasStarted = (startTime: string) => new Date(startTime).getTime() <= Date.now();

export default function PlayerReservations() {
  const tx = useTx();
  const { t } = useI18n();
  const { lang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: upcoming, isLoading: loadingUp } = useListUpcomingReservations();
  const { data: historyResponse, isLoading: loadingHistory } = useListReservations({ limit: 30 });
  const cancelReservation = useCancelReservation();
  const leaveSession = useLeaveSession();
  const { data: me } = useGetMe();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [toCancel, setToCancel] = useState<Reservation | null>(null);
  const [inviteFor, setInviteFor] = useState<number | null>(null);
  const rules = useClubRules();
  // Inside the club's notice period a cancellation is refused or refund-less: say so before, not after
  const isLate = (r: Reservation) =>
    rules.cancellationNoticeHours > 0 &&
    new Date(r.startTime).getTime() - Date.now() < rules.cancellationNoticeHours * 3600_000;
  const cancelBlocked = !!toCancel && isLate(toCancel) && rules.lateCancellation === "forbid";
  const cancelForfeits = !!toCancel && isLate(toCancel) && rules.lateCancellation === "no_refund";
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
    qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
  };
  const leave = (r: Reservation) =>
    leaveSession.mutate(
      { id: r.id },
      {
        onSuccess: (res) => {
          toast({
            title: tx({
              fr: "Vous avez quitté le match",
              en: "You left the match",
              ar: "غادرت المباراة",
            }),
            description: res.refunded
              ? tx({
                  fr: `${tokensLabel(res.refunded)} ${plural(res.refunded, "remboursé", "remboursés")}.`,
                  en: `${tokensLabel(res.refunded)} refunded.`,
                  ar: "تمت إعادة الرصيد.",
                })
              : undefined,
          });
          refresh();
        },
        onError: (e) =>
          toast({
            title: tx({ fr: "Impossible de quitter", en: "Couldn't leave", ar: "تعذر المغادرة" }),
            description: apiErrorText(e, tx),
            variant: "destructive",
          }),
      },
    );

  const history = (historyResponse?.data ?? []).filter(
    (r) => r.status !== "confirmed" || hasStarted(r.startTime),
  );
  const list = (upcoming ?? [])
    .slice()
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  // One cancellation per press: a second click would be answered "already cancelled"
  const cancelling = useRef(false);
  const confirmCancel = () => {
    if (!toCancel || cancelling.current) return;
    cancelling.current = true;
    const id = toCancel.id;
    cancelReservation.mutate(
      { id },
      {
        onSettled: () => {
          cancelling.current = false;
        },
        onSuccess: (cancelled) => {
          toast({
            title: tx({ fr: "Réservation annulée", en: "Booking cancelled", ar: "تم إلغاء الحجز" }),
            // Late cancellation under the club's "no refund" policy keeps the tokens
            description: cancelled.refundForfeited
              ? tx({
                  fr: "Annulation tardive : vos tokens ne sont pas remboursés.",
                  en: "Late cancellation: your tokens are not refunded.",
                  ar: "إلغاء متأخر: لا يُعاد رصيدك.",
                })
              : tx({
                  fr: "Vos tokens ont été remboursés.",
                  en: "Your tokens were refunded.",
                  ar: "تمت إعادة رصيدك.",
                }),
          });
          refresh();
          setToCancel(null);
        },
        onError: (e) => {
          toast({
            title: tx({ fr: "Annulation impossible", en: "Couldn't cancel", ar: "تعذر الإلغاء" }),
            description: apiErrorText(e, tx),
            variant: "destructive",
          });
          setToCancel(null);
        },
      },
    );
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t("reservations")}
        title={t("myReservations")}
        subtitle={tx({
          fr: "Vos matchs à venir et votre historique.",
          en: "Your upcoming matches and history.",
          ar: "مبارياتك القادمة وسجلك.",
        })}
        actions={
          <Button asChild>
            <Link href="/terrains">
              <CalendarPlusIcon />
              {t("bookCourt")}
            </Link>
          </Button>
        }
      />

      <div role="tablist" aria-label={t("reservations")} className="enter pill-group">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upcoming"}
          className="pill-tab"
          onClick={() => setTab("upcoming")}
        >
          {tx({ fr: "À venir", en: "Upcoming", ar: "القادمة" })}
          {list.length ? ` · ${list.length}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "past"}
          className="pill-tab"
          onClick={() => setTab("past")}
        >
          {tx({ fr: "Historique", en: "History", ar: "السجل" })}
        </button>
      </div>

      {tab === "upcoming" ? (
        loadingUp ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[112px] !rounded-[26px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<CalendarDotsIcon className="size-7" />}
            title={t("noUpcoming")}
            text={tx({
              fr: "Trouvez un créneau libre, ça prend 30 secondes.",
              en: "Find a free slot, it takes 30 seconds.",
              ar: "ابحث عن موعد متاح، يستغرق 30 ثانية.",
            })}
            action={
              <Button asChild>
                <Link href="/terrains">{t("bookCourt")}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="stagger m-0 flex list-none flex-col gap-3 p-0">
            {list.map((r, i) => {
              const mine = r.players?.find((p) => p.userId === me?.id);
              const organiser = r.userId === me?.id;
              const full = r.bookingMode === "full_court";
              const seats = r.players?.length ?? 0;
              const total = r.totalSpots ?? rules.maxPlayers;
              const started = hasStarted(r.startTime);
              const canInvite =
                rules.invitationsEnabled && !started && (organiser || !full) && seats < total;
              return (
                <li
                  key={r.id}
                  className="lift flex flex-col gap-4 rounded-[26px] bg-card p-4 shadow-sm sm:pe-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-4">
                      <DateBlock date={r.startTime} dark={i === 0} />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-extrabold">
                            {r.terrain?.name ?? "Court"}
                          </span>
                          <StatusBadge status={r.status} />
                        </span>
                        <span className="text-[15px] text-muted-foreground">
                          {clubDate(r.startTime, lang)} ·{" "}
                          <span dir="ltr" className="font-bold text-ink">
                            {clubTime(r.startTime)} – {clubTime(r.endTime)}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {full ? (
                              <UsersIcon className="size-3.5" />
                            ) : (
                              <UserCircleIcon className="size-3.5" />
                            )}
                            {full
                              ? tx({ fr: "Terrain complet", en: "Full court", ar: "ملعب كامل" })
                              : tx({ fr: "Place individuelle", en: "Own spot", ar: "مكان فردي" })}
                            {" · "}
                            {playersLabel(tx, seats, total, rules.minPlayers)}
                          </span>
                          {mine && (
                            <PaymentBadge type={mine.paymentType} status={mine.paymentStatus} />
                          )}
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          downloadIcs({
                            id: r.id,
                            startTime: r.startTime,
                            endTime: r.endTime,
                            terrainName: r.terrain?.name,
                          })
                        }
                      >
                        <DownloadSimpleIcon />
                        {tx({ fr: "Calendrier", en: "Calendar", ar: "التقويم" })}
                      </Button>
                      {canInvite && (
                        <Button
                          variant="dark"
                          size="sm"
                          onClick={() => setInviteFor(inviteFor === r.id ? null : r.id)}
                          aria-expanded={inviteFor === r.id}
                        >
                          <UserPlusIcon />
                          {tx({ fr: "Inviter", en: "Invite", ar: "دعوة" })}
                        </Button>
                      )}
                      {r.status === "confirmed" && !started && organiser && (
                        <Button
                          variant="outline-destructive"
                          size="sm"
                          onClick={() => setToCancel(r)}
                        >
                          <XIcon />
                          {t("cancel")}
                        </Button>
                      )}
                      {r.status === "confirmed" && !started && !organiser && mine && (
                        <Button
                          variant="outline-destructive"
                          size="sm"
                          onClick={() => leave(r)}
                          disabled={leaveSession.isPending}
                          loading={leaveSession.isPending}
                        >
                          <SignOutIcon />
                          {tx({ fr: "Quitter", en: "Leave", ar: "مغادرة" })}
                        </Button>
                      )}
                    </div>
                  </div>
                  {(r.players?.length ?? 0) > 0 && (
                    <ul
                      aria-label={tx({ fr: "Joueurs", en: "Players", ar: "اللاعبون" })}
                      className="m-0 flex list-none flex-wrap gap-2 border-t border-[#EEF1FA] p-0 pt-3"
                    >
                      {r.players!.map((pl, k) => {
                        const name =
                          pl.userId === me?.id
                            ? tx({ fr: "Vous", en: "You", ar: "أنت" })
                            : `${pl.user?.firstName ?? ""} ${pl.user?.lastName ?? ""}`.trim() ||
                              tx({ fr: "Joueur", en: "Player", ar: "لاعب" });
                        return (
                          <li
                            key={pl.id}
                            className="flex items-center gap-2 rounded-full bg-mist py-1 pe-3 ps-1 text-sm font-bold"
                          >
                            <Avatar name={name} index={k} size={26} />
                            {name}
                          </li>
                        );
                      })}
                      {total - seats > 0 && (
                        <li className="flex items-center rounded-full border border-dashed border-[#C6CEF6] px-3 py-1 text-sm font-semibold text-muted-foreground">
                          {full
                            ? tx({
                                fr: `${total - seats} ${plural(total - seats, "place à offrir", "places à offrir")}`,
                                en: `${total - seats} ${plural(total - seats, "spot to give", "spots to give")}`,
                                ar: `${total - seats} أماكن للإهداء`,
                              })
                            : tx({
                                fr: `${total - seats} ${plural(total - seats, "place libre", "places libres")}`,
                                en: `${total - seats} ${plural(total - seats, "open spot", "open spots")}`,
                                ar: `${total - seats} أماكن شاغرة`,
                              })}
                        </li>
                      )}
                    </ul>
                  )}
                  {inviteFor === r.id && (
                    <InvitePanel
                      reservationId={r.id}
                      free={full}
                      shareText={inviteShareText(tx, r.terrain?.name ?? "", r.startTime)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : loadingHistory ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[84px] !rounded-[22px]" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <EmptyState
          icon={<CalendarDotsIcon className="size-7" />}
          title={t("noPast")}
          text={tx({
            fr: "Vos matchs joués et annulés apparaîtront ici.",
            en: "Your played and cancelled matches will show up here.",
            ar: "ستظهر هنا مبارياتك السابقة والملغاة.",
          })}
        />
      ) : (
        <ul className="stagger m-0 flex list-none flex-col gap-2 p-0">
          {history.map((r) => (
            <li key={r.id} className="flex items-center gap-4 rounded-[22px] bg-card/70 p-3 pe-5">
              <DateBlock date={r.startTime} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-extrabold">{r.terrain?.name ?? "Court"}</span>
                <span className="text-sm text-muted-foreground">
                  {clubDate(r.startTime, lang, "weekday")} ·{" "}
                  <span dir="ltr">
                    {clubTime(r.startTime)} – {clubTime(r.endTime)}
                  </span>
                </span>
              </span>
              <StatusBadge status={r.status} played />
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!toCancel} onOpenChange={(o) => !o && setToCancel(null)}>
        <AlertDialogContent className="max-w-[440px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx({
                fr: "Annuler ce match ?",
                en: "Cancel this match?",
                ar: "إلغاء هذه المباراة؟",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {toCancel &&
                `${toCancel.terrain?.name ?? ""}, ${clubDateTime(toCancel.startTime, lang, "long")}. `}
              {cancelBlocked
                ? tx({
                    fr: `Les annulations en ligne s'arrêtent ${rules.cancellationNoticeHours} h avant le match. Appelez le club pour annuler.`,
                    en: `Online cancellations stop ${rules.cancellationNoticeHours} h before the match. Call the club to cancel.`,
                    ar: `يتوقف الإلغاء عبر التطبيق قبل المباراة بـ ${rules.cancellationNoticeHours} ساعة. اتصل بالنادي.`,
                  })
                : cancelForfeits
                  ? tx({
                      fr: `Annulation tardive (moins de ${rules.cancellationNoticeHours} h avant le match) : vos tokens ne seront pas remboursés. Les joueurs seront prévenus.`,
                      en: `Late cancellation (less than ${rules.cancellationNoticeHours} h before the match): your tokens will not be refunded. Players are notified.`,
                      ar: "إلغاء متأخر: لن يُعاد رصيدك. سيتم إبلاغ اللاعبين.",
                    })
                  : tx({
                      fr: "Tous les tokens payés pour ce match seront remboursés, et les joueurs prévenus.",
                      en: "Every token paid for this match is refunded and the players are notified.",
                      ar: "سيتم إرجاع كل الرصيد المدفوع وإبلاغ اللاعبين.",
                    })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-12 rounded-full">
              {cancelBlocked
                ? tx({ fr: "Fermer", en: "Close", ar: "إغلاق" })
                : tx({
                    fr: "Garder ma réservation",
                    en: "Keep my booking",
                    ar: "الإبقاء على الحجز",
                  })}
            </AlertDialogCancel>
            {!cancelBlocked && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmCancel();
                }}
                disabled={cancelReservation.isPending}
                className="h-12 rounded-full bg-destructive"
              >
                {cancelReservation.isPending && <SpinnerIcon className="spin size-4" />}
                {tx({ fr: "Annuler le match", en: "Cancel the match", ar: "إلغاء المباراة" })}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
