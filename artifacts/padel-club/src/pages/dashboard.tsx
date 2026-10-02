import { Link } from "wouter";
import { formatDistanceToNowStrict, differenceInMinutes } from "date-fns";
import {
  useGetMe,
  useGetTokenBalance,
  useListUpcomingReservations,
  useListTokenTransactions,
  useGetOpenMatches,
} from "@workspace/api-client-react";
import {
  ArrowRightIcon,
  CalendarPlusIcon,
  ClockIcon,
  CoinsIcon,
  MapPinIcon,
  TennisBallIcon,
  UsersIcon,
  TrophyIcon,
  WalletIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, CourtLines, EmptyState, LiveDot, Page } from "@/components/smash/primitives";
import { MatchCard } from "@/components/smash/match-card";
import { useJoinMatch } from "@/hooks/use-join-match";
import { InstallBanner } from "@/components/smash/install-banner";
import { useTx, useDateLocale, useI18n } from "@/lib/i18n";
import { clubTime, clubDate, clubDateTime } from "@/lib/club-time";
import { playersLabel, plural, tokensLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useClubRules } from "@/hooks/use-club-rules";
import { MyInvitations } from "@/components/smash/my-invitations";

export default function Dashboard() {
  const rules = useClubRules();
  const tx = useTx();
  const locale = useDateLocale();
  const { lang } = useI18n();
  const { data: user } = useGetMe();
  const { data: balance, isLoading: loadingBalance } = useGetTokenBalance();
  const { data: reservations, isLoading: loadingRes } = useListUpcomingReservations();
  const { data: matches } = useGetOpenMatches();
  const { data: activity } = useListTokenTransactions({ limit: 3 });
  const recent = activity?.data ?? [];
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
  const fullCourts = Math.floor(bal / Math.max(1, rules.tokenCostFullCourt));
  const expiring = balance?.pendingExpiry ?? 0;
  const minsToNext = next ? differenceInMinutes(new Date(next.startTime), new Date()) : null;

  const quick = [
    {
      href: "/terrains",
      icon: CalendarPlusIcon,
      label: tx({ fr: "Réserver", en: "Book a court", ar: "احجز" }),
      tone: "bg-court text-white",
    },
    ...(rules.openMatchesEnabled
      ? [
          {
            href: "/open-matches",
            icon: TennisBallIcon,
            label: "Open matches",
            tone: "bg-lilac text-night",
          },
        ]
      : []),
    {
      href: "/tournaments",
      icon: TrophyIcon,
      label: tx({ fr: "Tournois", en: "Tournaments", ar: "البطولات" }),
      tone: "bg-coral text-night",
    },
    {
      href: "/wallet",
      icon: WalletIcon,
      label: tx({ fr: "Mes tokens", en: "My tokens", ar: "رصيدي" }),
      tone: "bg-ball text-night",
    },
  ];

  return (
    <Page>
      <header className="enter flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[15px] font-semibold text-muted-foreground">
            {clubDate(new Date(), lang)}
          </span>
          <h1 className="disp m-0 text-[clamp(36px,5vw,60px)] leading-[0.95]">
            {hello}
            {user?.firstName ? `${lang === "ar" ? "،" : ","} ${user.firstName}` : ""}
            {lang === "fr" ? " !" : "!"}
          </h1>
        </div>
        {/* One primary action per screen: here when a match is planned, in the hero otherwise */}
        {next && (
          <Button asChild size="lg" className="shine shrink-0 self-start sm:self-auto">
            <Link href="/terrains">
              <CalendarPlusIcon />
              {tx({ fr: "Réserver un terrain", en: "Book a court", ar: "احجز ملعبًا" })}
            </Link>
          </Button>
        )}
      </header>

      <MyInvitations />

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
              className="absolute -end-12 -top-8 h-[190px] w-[330px] rotate-[-9deg] rounded-xl border-[3px] border-white/20 bg-court/50 max-sm:-end-36 max-sm:-top-20 max-sm:opacity-70 transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:-translate-x-3 group-hover:translate-y-2 group-hover:rotate-[-5deg]"
            >
              <CourtLines />
            </div>
            <span className="label relative flex items-center gap-3 text-ball">
              <LiveDot />
              {tx({ fr: "Votre prochain match", en: "Your next match", ar: "مباراتك القادمة" })}
            </span>
            <div className="relative flex flex-col gap-2">
              <span className="disp self-start text-[clamp(44px,6vw,72px)] leading-[0.9]" dir="ltr">
                {clubTime(next.startTime)}
              </span>
              <span className="text-lg font-semibold text-soft-d">
                {clubDate(next.startTime, lang)}
              </span>
            </div>
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-bold">
                  <MapPinIcon className="size-4 text-ball" />
                  {next.terrain?.name}
                </span>
                {next.players && next.totalSpots ? (
                  <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 font-bold">
                    <UsersIcon className="size-4 text-ball" />
                    {playersLabel(tx, next.players.length, next.totalSpots)}
                  </span>
                ) : null}
              </span>
              {minsToNext !== null && minsToNext > 0 && (
                <span className="flex items-center gap-2 rounded-full bg-ball px-4 py-2 font-extrabold text-night">
                  <ClockIcon className="size-4" />
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
            <Button asChild variant="lime" size="lg" className="shine self-start">
              <Link href="/terrains">
                {tx({ fr: "Réserver un terrain", en: "Book a court", ar: "احجز ملعبًا" })}
                <ArrowRightIcon className="btn-ic" />
              </Link>
            </Button>
          </div>
        )}

        {/* Tokens */}
        <Link
          href="/wallet"
          className="lift enter delay-1 group relative flex flex-col justify-between gap-5 overflow-hidden rounded-[32px] bg-ball p-7 text-night"
        >
          <CoinsIcon
            aria-hidden="true"
            weight="duotone"
            className="pointer-events-none absolute -end-6 -top-6 size-40 text-night/[.07] transition-transform duration-700 ease-[cubic-bezier(.3,1.4,.5,1)] group-hover:rotate-[24deg] group-hover:scale-110"
          />
          <span className="label relative flex items-center gap-2">
            <CoinsIcon className="size-4" weight="fill" />
            {tx({ fr: "Vos tokens", en: "Your tokens", ar: "رصيدك" })}
          </span>
          {loadingBalance ? (
            <Skeleton className="h-20 w-32 bg-night/10" />
          ) : (
            <CountUp
              value={bal}
              className="disp relative text-[96px] leading-[0.8] tracking-[-0.05em]"
            />
          )}
          <span className="text-[15px] font-semibold">
            {bal >= rules.tokenCostFullCourt
              ? tx({
                  fr: `De quoi réserver ${fullCourts} ${plural(fullCourts, "terrain complet", "terrains complets")}`,
                  en: `Enough for ${fullCourts} ${plural(fullCourts, "full court", "full courts")}`,
                  ar: `يكفي لـ ${fullCourts} ملعب كامل`,
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
          {expiring ? (
            <span className="text-sm font-semibold">
              {tx({
                fr: `${tokensLabel(expiring)} ${plural(expiring, "expire", "expirent")} bientôt`,
                en: `${tokensLabel(expiring)} ${plural(expiring, "expires", "expire")} soon`,
                ar: `${expiring} رصيد ينتهي قريبًا`,
              })}
            </span>
          ) : null}
        </Link>
      </div>

      <InstallBanner />

      <nav
        aria-label={tx({ fr: "Raccourcis", en: "Shortcuts", ar: "اختصارات" })}
        className="stagger grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {quick.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="lift tile group flex items-center justify-between gap-3 rounded-[24px] bg-card p-4 shadow-sm"
          >
            <span className="flex min-w-0 items-center gap-3 font-extrabold">
              <span
                className={`tile-ic flex size-11 shrink-0 items-center justify-center rounded-2xl ${q.tone}`}
              >
                <q.icon className="size-6" weight="duotone" />
              </span>
              <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">{q.label}</span>
            </span>
            <ArrowRightIcon className="tile-arrow hidden size-4 text-muted-foreground transition-colors group-hover:text-court sm:block" />
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
          <ul className="stagger m-0 flex list-none flex-col gap-2.5 p-0">
            {later.map((r) => (
              <li key={r.id}>
                <Link
                  href="/reservations"
                  className="group flex items-center gap-4 rounded-[22px] bg-card p-3 pe-5 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="flex size-14 flex-col items-center justify-center rounded-2xl bg-mist">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">
                      {clubDate(r.startTime, lang, "month")}
                    </span>
                    <span className="disp text-xl leading-none">
                      {clubDate(r.startTime, lang, "day")}
                    </span>
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-extrabold">{r.terrain?.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {clubDate(r.startTime, lang, "weekday")} ·{" "}
                      <span dir="ltr">{clubTime(r.startTime)}</span>
                    </span>
                  </span>
                  <ArrowRightIcon className="tile-arrow size-4 text-muted-foreground transition-[color,transform] group-hover:translate-x-1 group-hover:text-court rtl:scale-x-[-1]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rules.openMatchesEnabled && (
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="disp m-0 text-3xl">
              {tx({
                fr: "Des places vous attendent",
                en: "Spots waiting for you",
                ar: "أماكن بانتظارك",
              })}
            </h2>
            <Link href="/open-matches" className="ulink shrink-0 font-bold text-court">
              {tx({ fr: "Tout voir", en: "See all", ar: "عرض الكل" })}
            </Link>
          </div>
          {(matches ?? []).length === 0 ? (
            <EmptyState
              icon={<TennisBallIcon className="size-7" />}
              title={tx({ fr: "Aucun open match", en: "No open matches", ar: "لا مباريات مفتوحة" })}
              text={tx({
                fr: "Réservez « Juste ma place » et ouvrez votre match aux joueurs du club.",
                en: "Book “Just my spot” and open your match to club players.",
                ar: "احجز «مكاني فقط» وافتح مباراتك للاعبي النادي.",
              })}
              action={
                <Button asChild variant="outline">
                  <Link href="/terrains">
                    {tx({ fr: "Voir les créneaux", en: "See slots", ar: "المواعيد" })}
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="disp m-0 text-3xl">
              {tx({ fr: "Activité récente", en: "Recent activity", ar: "النشاط الأخير" })}
            </h2>
            <Link href="/wallet" className="ulink shrink-0 font-bold text-court">
              {tx({ fr: "Tout voir", en: "See all", ar: "عرض الكل" })}
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-[#EEF1FA] rounded-[24px] bg-card p-0 px-5 shadow-sm">
            {recent.map((x) => (
              <li key={x.id} className="flex items-center gap-4 py-3.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{x.description}</span>
                  <span className="text-sm text-muted-foreground">
                    {clubDateTime(x.createdAt, lang)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-base font-extrabold",
                    x.type === "credit" ? "text-[#0F6B3C]" : "text-ink",
                  )}
                >
                  {x.type === "credit" ? "+" : x.type === "debit" ? "−" : "±"}
                  {tokensLabel(x.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
