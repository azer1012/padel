import { Link } from "wouter";
import { format, formatDistanceToNowStrict, differenceInMinutes } from "date-fns";
import {
  useGetMe,
  useGetTokenBalance,
  useListUpcomingReservations,
  useGetOpenMatches,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  CalendarPlus,
  Coins,
  Swords,
  Trophy,
  Wallet,
  Clock3,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CourtLines, EmptyState, LiveDot, Page } from "@/components/smash/primitives";
import { MatchCard } from "@/components/smash/match-card";
import { useJoinMatch } from "@/hooks/use-join-match";
import { useTx, useDateLocale } from "@/lib/i18n";
import { CLUB } from "@/config/club";

export default function Dashboard() {
  const tx = useTx();
  const locale = useDateLocale();
  const { data: user } = useGetMe();
  const { data: balance, isLoading: loadingBalance } = useGetTokenBalance();
  const { data: reservations, isLoading: loadingRes } = useListUpcomingReservations();
  const { data: matches } = useGetOpenMatches();
  const { run, pendingId } = useJoinMatch();

  const upcoming = (reservations ?? [])
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
  const next = upcoming[0];
  const later = upcoming.slice(1, 4);
  const hour = new Date().getHours();
  const hello =
    hour < 12
      ? tx({ fr: "Bonjour", en: "Good morning", ar: "صباح الخير" })
      : hour < 18
        ? tx({ fr: "Salut", en: "Hi", ar: "مرحبًا" })
        : tx({ fr: "Bonsoir", en: "Good evening", ar: "مساء الخير" });
  const bal = balance?.balance ?? 0;
  const minsToNext = next ? differenceInMinutes(new Date(next.startTime), new Date()) : null;

  const quick = [
    {
      href: "/terrains",
      icon: CalendarPlus,
      label: tx({ fr: "Réserver", en: "Book a court", ar: "احجز" }),
      tone: "bg-court text-white",
    },
    { href: "/open-matches", icon: Swords, label: "Open matches", tone: "bg-lilac text-night" },
    {
      href: "/tournaments",
      icon: Trophy,
      label: tx({ fr: "Tournois", en: "Tournaments", ar: "البطولات" }),
      tone: "bg-coral text-night",
    },
    {
      href: "/wallet",
      icon: Wallet,
      label: tx({ fr: "Portefeuille", en: "Wallet", ar: "المحفظة" }),
      tone: "bg-ball text-night",
    },
  ];

  return (
    <Page>
      <header className="enter flex flex-col gap-2">
        <span className="text-[15px] font-semibold capitalize text-muted-foreground">
          {format(new Date(), "EEEE d MMMM", { locale })}
        </span>
        <h1 className="disp m-0 text-[clamp(38px,5vw,60px)] leading-[0.95]">
          {hello}
          {user?.firstName ? `, ${user.firstName}` : ""} !
        </h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Next match */}
        {loadingRes ? (
          <Skeleton className="h-[280px] !rounded-[32px]" />
        ) : next ? (
          <Link
            href="/reservations"
            className="on-dark lift enter group relative flex min-h-[280px] flex-col justify-between gap-6 overflow-hidden rounded-[32px] bg-night p-7 text-white"
          >
            <div
              aria-hidden="true"
              className="absolute -end-12 -top-8 h-[190px] w-[330px] rotate-[-9deg] rounded-xl border-[3px] border-white/20 bg-court/50"
            >
              <CourtLines />
            </div>
            <span className="label relative flex items-center gap-3 text-ball">
              <LiveDot />
              {tx({ fr: "Votre prochain match", en: "Your next match", ar: "مباراتك القادمة" })}
            </span>
            <div className="relative flex flex-col gap-2">
              <span className="disp text-[clamp(44px,6vw,72px)] leading-[0.9]" dir="ltr">
                {format(new Date(next.startTime), "HH:mm")}
              </span>
              <span className="text-lg font-semibold capitalize text-soft-d">
                {format(new Date(next.startTime), "EEEE d MMMM", { locale })}
              </span>
            </div>
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-bold">
                <MapPin className="size-4 text-ball" />
                {next.terrain?.name}
              </span>
              {minsToNext !== null && minsToNext > 0 && (
                <span className="flex items-center gap-2 rounded-full bg-ball px-4 py-2 font-extrabold text-night">
                  <Clock3 className="size-4" />
                  {tx({ fr: "dans ", en: "in ", ar: "بعد " })}
                  {formatDistanceToNowStrict(new Date(next.startTime), { locale })}
                </span>
              )}
            </div>
          </Link>
        ) : (
          <div className="on-dark enter flex min-h-[280px] flex-col justify-between gap-6 rounded-[32px] bg-night p-7 text-white">
            <span className="label text-ball">
              {tx({ fr: "Aucun match prévu", en: "No match planned", ar: "لا مباراة مخططة" })}
            </span>
            <span className="disp text-[clamp(34px,4.4vw,52px)] leading-[0.95]">
              {tx({
                fr: "Le terrain vous attend.",
                en: "The court is waiting.",
                ar: "الملعب بانتظارك.",
              })}
            </span>
            <Button asChild variant="lime" size="lg" className="self-start">
              <Link href="/terrains">
                {tx({ fr: "Réserver un terrain", en: "Book a court", ar: "احجز ملعبًا" })}
                <ArrowRight className="btn-ic" />
              </Link>
            </Button>
          </div>
        )}

        {/* Tokens */}
        <Link
          href="/wallet"
          className="lift enter flex flex-col justify-between gap-5 rounded-[32px] bg-ball p-7 text-night"
        >
          <span className="label flex items-center gap-2">
            <Coins className="size-4" />
            {tx({ fr: "Vos tokens", en: "Your tokens", ar: "رصيدك" })}
          </span>
          {loadingBalance ? (
            <Skeleton className="h-20 w-32 bg-night/10" />
          ) : (
            <span className="disp text-[96px] leading-[0.8] tracking-[-0.05em]">{bal}</span>
          )}
          <span className="text-[15px] font-semibold">
            {bal >= CLUB.tokensFullCourt
              ? tx({
                  fr: `De quoi réserver ${Math.floor(bal / CLUB.tokensFullCourt)} terrain(s) complet(s)`,
                  en: `Enough for ${Math.floor(bal / CLUB.tokensFullCourt)} full court(s)`,
                  ar: `يكفي لـ ${Math.floor(bal / CLUB.tokensFullCourt)} ملعب كامل`,
                })
              : bal > 0
                ? tx({
                    fr: "Assez pour rejoindre un open match",
                    en: "Enough to join an open match",
                    ar: "يكفي للانضمام لمباراة مفتوحة",
                  })
                : tx({
                    fr: "Rechargez à l'accueil du club",
                    en: "Top up at the front desk",
                    ar: "اشحن في الاستقبال",
                  })}
          </span>
          {balance?.pendingExpiry ? (
            <span className="text-sm">
              {tx({
                fr: `${balance.pendingExpiry} token(s) expirent bientôt`,
                en: `${balance.pendingExpiry} token(s) expire soon`,
                ar: `${balance.pendingExpiry} رصيد ينتهي قريبًا`,
              })}
            </span>
          ) : null}
        </Link>
      </div>

      <nav
        aria-label={tx({ fr: "Raccourcis", en: "Shortcuts", ar: "اختصارات" })}
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {quick.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="lift group flex items-center justify-between gap-3 rounded-[24px] bg-card p-4 shadow-sm"
          >
            <span className="flex items-center gap-3 font-extrabold">
              <span className={`flex size-11 items-center justify-center rounded-2xl ${q.tone}`}>
                <q.icon className="size-5" />
              </span>
              {q.label}
            </span>
            <ArrowRight className="btn-ic hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-1 sm:block rtl:scale-x-[-1]" />
          </Link>
        ))}
      </nav>

      {later.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="disp m-0 text-3xl">
              {tx({ fr: "Ensuite", en: "Coming up", ar: "لاحقًا" })}
            </h2>
            <Link href="/reservations" className="ulink font-bold text-court">
              {tx({ fr: "Tout voir", en: "See all", ar: "عرض الكل" })}
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {later.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-4 rounded-[22px] bg-card p-3 pe-5 shadow-sm"
              >
                <span className="flex size-14 flex-col items-center justify-center rounded-2xl bg-mist">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">
                    {format(new Date(r.startTime), "MMM", { locale })}
                  </span>
                  <span className="disp text-xl leading-none">
                    {format(new Date(r.startTime), "d")}
                  </span>
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="font-extrabold">{r.terrain?.name}</span>
                  <span className="text-sm capitalize text-muted-foreground">
                    {format(new Date(r.startTime), "EEEE", { locale })} ·{" "}
                    <span dir="ltr">{format(new Date(r.startTime), "HH:mm")}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <h2 className="disp m-0 text-3xl">
            {tx({
              fr: "Des places vous attendent",
              en: "Spots waiting for you",
              ar: "أماكن بانتظارك",
            })}
          </h2>
          <Link href="/open-matches" className="ulink font-bold text-court">
            {tx({ fr: "Tous", en: "All", ar: "الكل" })}
          </Link>
        </div>
        {(matches ?? []).length === 0 ? (
          <EmptyState
            icon={<Swords className="size-7" />}
            title={tx({ fr: "Aucun open match", en: "No open matches", ar: "لا مباريات مفتوحة" })}
            text={tx({
              fr: "Ouvrez le vôtre depuis la page de réservation.",
              en: "Open your own from the booking page.",
              ar: "افتح مباراتك من صفحة الحجز.",
            })}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {(matches ?? []).slice(0, 3).map((m) => (
              <MatchCard
                key={m.reservationId}
                match={m}
                pending={pendingId === m.reservationId}
                onJoin={() => run(m.reservationId, m.startTime)}
              />
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
