import { useMemo } from "react";
import { Link } from "wouter";
import {
  useGetMe,
  useGetDashboardStats,
  useGetRecentActivity,
  useGetOccupancyStats,
  useGetCalendar,
} from "@workspace/api-client-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CalendarXIcon,
  CoinsIcon,
  MoneyIcon,
  PlusIcon,
  PulseIcon,
  UserPlusIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, EmptyState, LiveDot, Page, PageHeader } from "@/components/smash/primitives";
import { useTx, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { openingHourBounds, useClubRules } from "@/hooks/use-club-rules";
import {
  clubTime,
  clubDate,
  clubDateTime,
  clubToday,
  clubDayLabel,
  addClubDays,
  clubMinutes,
} from "@/lib/club-time";
import { plural } from "@/lib/labels";

export default function AdminDashboard() {
  const rules = useClubRules();
  const tx = useTx();
  const { lang } = useI18n();
  const { data: user } = useGetMe();
  const today = clubToday();
  const { data: stats, isLoading: loadingStats } = useGetDashboardStats();
  const { data: activity } = useGetRecentActivity({ limit: 8 });
  const { data: occupancy } = useGetOccupancyStats({
    startDate: addClubDays(today, -6),
    endDate: today,
  });
  const { data: calendar, isLoading: loadingCal } = useGetCalendar(
    { date: today },
    { query: { refetchInterval: 60_000 } },
  );

  // Today's timeline runs from the club's earliest opening to its latest closing
  const { firstHour: dayStart, lastHour: dayEnd } = openingHourBounds(rules.openingHours);
  const now = new Date();
  // Position on the timeline, in club time (0 = dayStart, 1 = dayEnd)
  const frac = (hours: number) => (hours - dayStart) / (dayEnd - dayStart);
  const nowFrac = Math.min(1, Math.max(0, frac(clubMinutes(now) / 60)));
  const hours = Array.from(
    { length: Math.floor((dayEnd - dayStart) / 2) + 1 },
    (_, i) => dayStart + i * 2,
  ).filter((h) => h < dayEnd);
  const chart = useMemo(
    () =>
      (occupancy ?? []).map((d) => ({
        day: clubDayLabel(d.date, lang, "weekdayShort"),
        rate: Math.round(d.occupancyRate),
      })),
    [occupancy, lang],
  );

  // What needs a human today: cash still to collect, courts out of service
  const cashDue = (calendar?.terrains ?? []).reduce(
    (n, t) =>
      n +
      t.slots.reduce(
        (m, s) =>
          m +
          (s.reservationId && !s.isBlocked
            ? s.players.filter((p) => p.paymentType === "cash_club" && p.paymentStatus !== "paid")
                .length
            : 0),
        0,
      ),
    0,
  );
  const inMaintenance = (calendar?.terrains ?? []).filter((t) => t.terrain.isMaintenance);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (user && user.role !== "admin")
    return (
      <Page>
        <EmptyState
          title={tx({ fr: "Accès réservé aux admins", en: "Admins only", ar: "للمسؤولين فقط" })}
        />
      </Page>
    );

  const kpis = [
    {
      label: tx({ fr: "Réservations aujourd'hui", en: "Bookings today", ar: "حجوزات اليوم" }),
      value: stats?.totalReservationsToday ?? 0,
      suffix: "",
      sub: tx({
        fr: `${stats?.upcomingReservations ?? 0} à venir`,
        en: `${stats?.upcomingReservations ?? 0} still to come`,
        ar: `${stats?.upcomingReservations ?? 0} قادمة`,
      }),
      icon: CalendarDotsIcon,
      tone: "on-dark bg-court text-white",
    },
    {
      label: tx({ fr: "Taux d'occupation", en: "Courts filled", ar: "نسبة الإشغال" }),
      value: Math.round(stats?.occupancyRateToday ?? 0),
      suffix: "%",
      bar: Math.round(stats?.occupancyRateToday ?? 0),
      icon: PulseIcon,
      tone: "bg-ball text-night",
    },
    {
      label: tx({ fr: "Membres actifs", en: "Active members", ar: "أعضاء نشطون" }),
      value: stats?.activeUsers ?? 0,
      suffix: "",
      sub: tx({
        fr: `${stats?.totalReservationsThisMonth ?? 0} réservations ce mois`,
        en: `${stats?.totalReservationsThisMonth ?? 0} bookings this month`,
        ar: `${stats?.totalReservationsThisMonth ?? 0} حجز هذا الشهر`,
      }),
      icon: UsersIcon,
      tone: "bg-card",
    },
    {
      label: tx({ fr: "Tokens émis", en: "Tokens issued", ar: "الرصيد المُصدر" }),
      value: stats?.totalTokensIssued ?? 0,
      suffix: "",
      sub:
        stats?.revenueEquivalentToday != null
          ? tx({
              fr: `≈ ${stats.revenueEquivalentToday} ${rules.currency} aujourd'hui`,
              en: `≈ ${stats.revenueEquivalentToday} ${rules.currency} today`,
              ar: `≈ ${stats.revenueEquivalentToday} ${rules.currency} اليوم`,
            })
          : undefined,
      icon: CoinsIcon,
      tone: "bg-coral text-night",
    },
  ];
  const activityIcon = (type: string) =>
    type === "reservation_cancelled"
      ? CalendarXIcon
      : type === "user_registered"
        ? UserPlusIcon
        : type.startsWith("token")
          ? CoinsIcon
          : CalendarCheckIcon;

  return (
    <Page wide>
      <PageHeader
        eyebrow={clubDate(new Date(), lang)}
        title={tx({ fr: "Aujourd'hui au club", en: "Today at the club", ar: "اليوم في النادي" })}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/tokens">
                <CoinsIcon />
                {tx({ fr: "Créditer des tokens", en: "Credit tokens", ar: "إضافة رصيد" })}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/reservations">
                <PlusIcon />
                {tx({ fr: "Nouvelle réservation", en: "New booking", ar: "حجز جديد" })}
              </Link>
            </Button>
          </>
        }
      />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={cn(
              "lift tile group flex flex-col gap-2 rounded-[26px] p-5 shadow-sm",
              k.tone,
            )}
          >
            <span className="flex items-start justify-between gap-2 text-sm font-semibold">
              <span className="opacity-90">{k.label}</span>
              <span className="tile-ic flex size-9 shrink-0 items-center justify-center rounded-xl bg-current/10">
                <k.icon className="size-5" weight="duotone" />
              </span>
            </span>
            {loadingStats ? (
              <Skeleton className="h-11 w-20 bg-current/10" />
            ) : (
              <span className="disp text-[44px] leading-none">
                <CountUp value={k.value} format={(n) => `${Math.round(n)}${k.suffix}`} />
              </span>
            )}
            {k.bar !== undefined ? (
              <span className="h-2 overflow-hidden rounded-full bg-night/15">
                <span
                  className="grow-x block h-full rounded-full bg-night"
                  style={{ width: `${k.bar}%` }}
                />
              </span>
            ) : (
              k.sub && <span className="text-sm opacity-90">{k.sub}</span>
            )}
          </div>
        ))}
      </div>

      {(cashDue > 0 || inMaintenance.length > 0) && (
        <ul
          aria-label={tx({ fr: "À traiter", en: "Needs attention", ar: "يحتاج متابعة" })}
          className="enter m-0 flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap"
        >
          {cashDue > 0 && (
            <li>
              <Link
                href="/admin/reservations"
                className="group flex items-center gap-3 rounded-2xl bg-[#FFEBD9] px-4 py-3 text-[15px] font-bold text-[#7A3A0D] transition-transform hover:-translate-y-0.5"
              >
                <MoneyIcon className="size-5 shrink-0" />
                {tx({
                  fr: `${cashDue} ${plural(cashDue, "paiement en espèces à encaisser", "paiements en espèces à encaisser")} aujourd'hui`,
                  en: `${cashDue} cash ${plural(cashDue, "payment", "payments")} to collect today`,
                  ar: `${cashDue} دفعات نقدية للتحصيل اليوم`,
                })}
                <ArrowRightIcon className="btn-ic ms-auto size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </li>
          )}
          {inMaintenance.length > 0 && (
            <li>
              <Link
                href="/admin/terrains"
                className="group flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
              >
                <WrenchIcon className="size-5 shrink-0" />
                {tx({
                  fr: `En maintenance : ${inMaintenance.map((t) => t.terrain.name).join(", ")}`,
                  en: `Under maintenance: ${inMaintenance.map((t) => t.terrain.name).join(", ")}`,
                  ar: `تحت الصيانة: ${inMaintenance.map((t) => t.terrain.name).join("، ")}`,
                })}
                <ArrowRightIcon className="btn-ic ms-auto size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </li>
          )}
        </ul>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Today's court timeline */}
        <section className="flex min-w-0 flex-col gap-4 rounded-[30px] bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="disp m-0 text-2xl">
              {tx({ fr: "Planning des terrains", en: "Court schedule", ar: "جدول الملاعب" })}
            </h2>
            <ul className="m-0 flex list-none flex-wrap gap-4 p-0 text-[13px] font-semibold text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-court" />
                {tx({ fr: "Complet", en: "Full court", ar: "كامل" })}
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-lilac" />
                {tx({ fr: "Places ouvertes", en: "Open spots", ar: "أماكن شاغرة" })}
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-ball" />
                Open match
              </li>
            </ul>
          </div>
          {loadingCal ? (
            <Skeleton className="h-[320px]" />
          ) : !calendar?.terrains.length ? (
            <EmptyState
              title={tx({ fr: "Aucun terrain actif", en: "No active courts", ar: "لا ملاعب نشطة" })}
            />
          ) : (
            // Scrolls sideways on small screens: reachable from the keyboard too
            <div
              className="relative overflow-x-auto"
              role="region"
              tabIndex={0}
              aria-label={tx({
                fr: "Occupation des terrains aujourd'hui",
                en: "Court occupancy today",
                ar: "إشغال الملاعب اليوم",
              })}
            >
              <div className="min-w-[920px]">
                <div className="flex ps-[112px] text-xs font-bold text-muted-foreground" dir="ltr">
                  <div className="relative h-5 flex-1">
                    {hours.map((h) => (
                      <span
                        key={h}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${frac(h) * 100}%` }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative mt-2 flex flex-col gap-2" dir="ltr">
                  {calendar.terrains.map(({ terrain, slots }, row) => (
                    <div key={terrain.id} className="flex items-stretch">
                      <span className="flex w-[112px] shrink-0 flex-col justify-center pe-3">
                        <span className="truncate text-[15px] font-extrabold">{terrain.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
                        </span>
                      </span>
                      <div className="relative h-[58px] flex-1 rounded-2xl bg-mist">
                        {slots
                          .filter((s) => s.reservationId)
                          .map((s, col) => {
                            // A match ending at midnight ends at hour 24, not 0
                            const h0 = clubMinutes(s.startTime) / 60,
                              h1 = clubMinutes(s.endTime) / 60 || 24;
                            const left = frac(h0) * 100,
                              width = (frac(h1) - frac(h0)) * 100;
                            if (left < 0 || left > 100) return null;
                            const tone = s.isPublic
                              ? "bg-ball text-night"
                              : s.status === "full" || s.bookingMode === "full_court"
                                ? "bg-court text-white"
                                : "bg-lilac text-night";
                            const who =
                              s.creatorName ??
                              s.players[0]?.name ??
                              tx({ fr: "Réservé", en: "Booked", ar: "محجوز" });
                            return (
                              <Link
                                key={s.startTime}
                                href="/admin/reservations"
                                title={`${who} · ${clubTime(s.startTime)}–${clubTime(s.endTime)} · ${s.filledSpots}/${s.totalSpots}`}
                                className={cn(
                                  "grow-x absolute inset-y-1 flex flex-col justify-center overflow-hidden rounded-xl px-2 transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md",
                                  tone,
                                )}
                                style={{
                                  left: `${left}%`,
                                  width: `calc(${width}% - 4px)`,
                                  animationDelay: `${Math.min(row * 70 + col * 40, 900)}ms`,
                                }}
                              >
                                <span className="truncate text-[13px] font-extrabold">
                                  {who.split(" ")[0]}
                                </span>
                                <span className="truncate text-[11px] font-semibold opacity-90">
                                  {clubTime(s.startTime)} · {s.filledSpots}/{s.totalSpots}
                                </span>
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                  {nowFrac > 0 && nowFrac < 1 && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-2 bottom-0 w-0.5 bg-coral"
                      style={{ left: `calc(112px + (100% - 112px) * ${nowFrac})` }}
                    >
                      <span className="absolute -top-5 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-coral px-2 py-0.5 text-[11px] font-extrabold text-night">
                        <LiveDot color="var(--color-night)" className="!size-1.5" />
                        {clubTime(now)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Activity */}
        <section className="on-dark flex flex-col gap-4 rounded-[30px] bg-night p-5 text-white sm:p-6">
          <h2 className="disp m-0 text-2xl">
            {tx({ fr: "Activité récente", en: "Recent activity", ar: "النشاط الأخير" })}
          </h2>
          {(activity ?? []).length === 0 ? (
            <p className="m-0 text-muted-d">
              {tx({ fr: "Rien pour l'instant.", en: "Nothing yet.", ar: "لا شيء بعد." })}
            </p>
          ) : (
            <ul className="stagger m-0 flex list-none flex-col gap-2 p-0">
              {(activity ?? []).map((a) => {
                const Icon = activityIcon(a.type);
                return (
                  <li
                    key={a.id}
                    className="flex gap-3 rounded-2xl bg-white/6 p-3 transition-colors duration-300 hover:bg-white/10"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ball">
                      <Icon className="size-[18px]" weight="duotone" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold leading-snug">{a.message}</span>
                      <span className="text-xs text-muted-d">
                        {clubDateTime(a.createdAt, lang, "dayMonth")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-[30px] bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="disp m-0 text-2xl">
            {tx({
              fr: "Occupation, 7 derniers jours",
              en: "Occupancy, last 7 days",
              ar: "الإشغال، آخر 7 أيام",
            })}
          </h2>
          <Link
            href="/admin/reservations"
            className="ulink flex items-center gap-1 font-bold text-court"
          >
            {tx({ fr: "Réservations", en: "Bookings", ar: "الحجوزات" })}
            <ArrowRightIcon className="btn-ic size-4" />
          </Link>
        </div>
        {chart.length === 0 ? (
          <Skeleton className="h-[220px]" />
        ) : (
          <div className="h-[240px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#4A5488", fontSize: 13, fontWeight: 700 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fill: "#4A5488", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(46,76,246,.06)" }}
                  contentStyle={{
                    borderRadius: 16,
                    border: "none",
                    boxShadow: "0 12px 30px -12px rgba(16,26,77,.35)",
                  }}
                  formatter={(v: number) => [
                    `${v}%`,
                    tx({ fr: "Occupation", en: "Occupancy", ar: "الإشغال" }),
                  ]}
                />
                <Bar
                  dataKey="rate"
                  fill="#2E4CF6"
                  radius={[10, 10, 10, 10]}
                  maxBarSize={48}
                  isAnimationActive={!reduceMotion}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </Page>
  );
}
