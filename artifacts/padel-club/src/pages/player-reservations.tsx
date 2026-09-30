import { useState } from "react";
import { Link } from "wouter";
import { format, isPast } from "date-fns";
import {
  useListReservations,
  useListUpcomingReservations,
  useCancelReservation,
  getListReservationsQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
  getOpenMatchesQueryKey,
} from "@workspace/api-client-react";
import type { Reservation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CalendarDays, MapPin, Coins, X, Download } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useI18n, useTx, useDateLocale } from "@/lib/i18n";
import { CLUB } from "@/config/club";
import { cn } from "@/lib/utils";

/** Build a tiny .ics so players can add the match to their calendar. */
function downloadIcs(r: Reservation) {
  const f = (d: string) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Smash Padel//FR",
    "BEGIN:VEVENT",
    `UID:reservation-${r.id}@smashpadel`,
    `DTSTAMP:${f(new Date().toISOString())}`,
    `DTSTART:${f(r.startTime)}`,
    `DTEND:${f(r.endTime)}`,
    `SUMMARY:Padel · ${r.terrain?.name ?? ""}`,
    `LOCATION:${CLUB.name}, ${CLUB.address}, ${CLUB.postal}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Padel",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `padel-${r.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatusBadge({ status }: { status: string }) {
  const tx = useTx();
  if (status === "confirmed")
    return <Badge variant="success">{tx({ fr: "Confirmé", en: "Confirmed", ar: "مؤكد" })}</Badge>;
  if (status === "cancelled")
    return <Badge variant="danger">{tx({ fr: "Annulé", en: "Cancelled", ar: "ملغى" })}</Badge>;
  return (
    <Badge variant="warning">{tx({ fr: "En attente", en: "Pending", ar: "قيد الانتظار" })}</Badge>
  );
}

function DateBlock({ date, dark }: { date: string; dark?: boolean }) {
  const locale = useDateLocale();
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
        {format(new Date(date), "MMM", { locale })}
      </span>
      <span className="disp text-[28px] leading-none">{format(new Date(date), "d")}</span>
    </span>
  );
}

export default function PlayerReservations() {
  const tx = useTx();
  const { t } = useI18n();
  const locale = useDateLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: upcoming, isLoading: loadingUp } = useListUpcomingReservations();
  const { data: historyResponse, isLoading: loadingHistory } = useListReservations({ limit: 30 });
  const cancelReservation = useCancelReservation();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [toCancel, setToCancel] = useState<Reservation | null>(null);

  const history = (historyResponse?.data ?? []).filter(
    (r) => r.status !== "confirmed" || isPast(new Date(r.startTime)),
  );
  const list = (upcoming ?? [])
    .slice()
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  const confirmCancel = () => {
    if (!toCancel) return;
    const id = toCancel.id;
    cancelReservation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({
            title: tx({ fr: "Réservation annulée", en: "Booking cancelled", ar: "تم إلغاء الحجز" }),
            description: tx({
              fr: "Vos tokens ont été remboursés.",
              en: "Your tokens were refunded.",
              ar: "تمت إعادة رصيدك.",
            }),
          });
          qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
          qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
          setToCancel(null);
        },
        onError: (e: any) => {
          toast({
            title: tx({ fr: "Annulation impossible", en: "Couldn't cancel", ar: "تعذر الإلغاء" }),
            description: e?.data?.error,
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
              <CalendarPlus />
              {t("bookCourt")}
            </Link>
          </Button>
        }
      />

      <div
        role="tablist"
        aria-label={t("reservations")}
        className="enter flex self-start rounded-full bg-card p-1 shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upcoming"}
          className="pill-tab h-10"
          onClick={() => setTab("upcoming")}
        >
          {t("upcomingBookings")}
          {list.length ? ` · ${list.length}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "past"}
          className="pill-tab h-10"
          onClick={() => setTab("past")}
        >
          {t("pastBookings")}
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
            icon={<CalendarDays className="size-7" />}
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
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {list.map((r, i) => (
              <li
                key={r.id}
                className="lift flex flex-col gap-4 rounded-[26px] bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:pe-5"
              >
                <div className="flex flex-1 items-center gap-4">
                  <DateBlock date={r.startTime} dark={i === 0} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-extrabold">{r.terrain?.name ?? "Court"}</span>
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="text-[15px] capitalize text-muted-foreground">
                      {format(new Date(r.startTime), "EEEE", { locale })} ·{" "}
                      <span dir="ltr">
                        {format(new Date(r.startTime), "HH:mm")} –{" "}
                        {format(new Date(r.endTime), "HH:mm")}
                      </span>
                    </span>
                    {r.tokensCharged ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-court">
                        <Coins className="size-3.5" />
                        {r.tokensCharged} token{r.tokensCharged > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => downloadIcs(r)}>
                    <Download />
                    {tx({ fr: "Calendrier", en: "Calendar", ar: "التقويم" })}
                  </Button>
                  {r.status === "confirmed" && (
                    <Button variant="outline-destructive" size="sm" onClick={() => setToCancel(r)}>
                      <X />
                      {t("cancel")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : loadingHistory ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[84px] !rounded-[22px]" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <EmptyState title={t("noPast")} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {history.map((r) => (
            <li key={r.id} className="flex items-center gap-4 rounded-[22px] bg-card/70 p-3 pe-5">
              <DateBlock date={r.startTime} />
              <span className="flex flex-1 flex-col">
                <span className="font-extrabold">{r.terrain?.name ?? "Court"}</span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  <span dir="ltr">{format(new Date(r.startTime), "HH:mm")}</span>
                </span>
              </span>
              <StatusBadge status={r.status} />
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
                `${toCancel.terrain?.name ?? ""}, ${format(new Date(toCancel.startTime), "EEEE d MMMM HH:mm", { locale })}. `}
              {tx({
                fr: "Vos tokens seront remboursés.",
                en: "Your tokens will be refunded.",
                ar: "سيتم إرجاع رصيدك.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-12 rounded-full">
              {tx({ fr: "Garder", en: "Keep it", ar: "الإبقاء" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmCancel();
              }}
              disabled={cancelReservation.isPending}
              className="h-12 rounded-full bg-destructive"
            >
              {cancelReservation.isPending
                ? "…"
                : tx({ fr: "Oui, annuler", en: "Yes, cancel", ar: "نعم، ألغِ" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
