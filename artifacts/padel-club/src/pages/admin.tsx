import { useMemo } from "react";
import { Link } from "wouter";
import { format, subDays, differenceInMinutes, startOfDay } from "date-fns";
import {
  useGetMe,
  useGetDashboardStats,
  useGetRecentActivity,
  useGetOccupancyStats,
  useGetCalendar,
} from "@workspace/api-client-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CalendarDays,
  Users,
  Activity,
  Coins,
  Plus,
  ArrowRight,
  UserPlus,
  CalendarX2,
  CalendarCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Page, PageHeader } from "@/components/smash/primitives";
import { useTx, useDateLocale } from "@/lib/i18n";
import { CLUB } from "@/config/club";
import { cn } from "@/lib/utils";

const DAY_START = 7,
  DAY_END = 24;

export default function AdminDashboard() {
  const tx = useTx();
  const locale = useDateLocale();
  const { data: user } = useGetMe();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: stats, isLoading: loadingStats } = useGetDashboardStats();
  const { data: activity } = useGetRecentActivity({ limit: 8 });
  const { data: occupancy } = useGetOccupancyStats({
    startDate: format(subDays(new Date(), 6), "yyyy-MM-dd"),
    endDate: today,
  });
  const { data: calendar, isLoading: loadingCal } = useGetCalendar(
    { date: today },
    { query: { refetchInterval: 60_000 } as any },
  );

  const now = new Date();
  const nowFrac = Math.min(
    1,
    Math.max(
      0,
      (differenceInMinutes(now, startOfDay(now)) / 60 - DAY_START) / (DAY_END - DAY_START),
    ),
  );
  const hours = Array.from(
    { length: (DAY_END - DAY_START) / 2 + 1 },
    (_, i) => DAY_START + i * 2,
  ).filter((h) => h < DAY_END);
  const chart = useMemo(
    () =>
      (occupancy ?? []).map((d) => ({
        day: format(new Date(d.date), "EEE", { locale }),
        rate: Math.round(d.occupancyRate),
      })),
    [occupancy, locale],
  );

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
      sub: tx({
        fr: `${stats?.upcomingReservations ?? 0} à venir`,
        en: `${stats?.upcomingReservations ?? 0} still to come`,
        ar: `${stats?.upcomingReservations ?? 0} قادمة`,
      }),
      icon: CalendarDays,
      tone: "on-dark bg-court text-white",
    },
    {
      label: tx({ fr: "Taux d'occupation", en: "Courts filled", ar: "نسبة الإشغال" }),
      value: `${Math.round(stats?.occupancyRateToday ?? 0)}%`,
      bar: Math.round(stats?.occupancyRateToday ?? 0),
      icon: Activity,
      tone: "bg-ball text-night",
    },
    {
      label: tx({ fr: "Membres actifs", en: "Active members", ar: "أعضاء نشطون" }),
      value: stats?.activeUsers ?? 0,
      sub: tx({
        fr: `${stats?.totalReservationsThisMonth ?? 0} réservations ce mois`,
        en: `${stats?.totalReservationsThisMonth ?? 0} bookings this month`,
        ar: `${stats?.totalReservationsThisMonth ?? 0} حجز هذا الشهر`,
      }),
      icon: Users,
      tone: "bg-card",
    },
    {
      label: tx({ fr: "Tokens émis", en: "Tokens issued", ar: "الرصيد المُصدر" }),
      value: stats?.totalTokensIssued ?? 0,
      sub:
        stats?.revenueEquivalentToday != null
          ? tx({
              fr: `≈ ${stats.revenueEquivalentToday} ${CLUB.currency} aujourd'hui`,
              en: `≈ ${stats.revenueEquivalentToday} ${CLUB.currency} today`,
              ar: `≈ ${stats.revenueEquivalentToday} ${CLUB.currency} اليوم`,
            })
          : undefined,
      icon: Coins,
      tone: "bg-coral text-night",
    },
  ];
  const activityIcon = (type: string) =>
    type === "reservation_cancelled"
      ? CalendarX2
      : type === "user_registered"
        ? UserPlus
        : type.startsWith("token")
          ? Coins
          : CalendarCheck2;

  return (
    <Page wide>
      <PageHeader
        eyebrow={format(new Date(), "EEEE d MMMM", { locale })}
        title={tx({ fr: "Aujourd'hui au club", en: "Today at the club", ar: "اليوم في النادي" })}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/tokens">
                <Coins />
                {tx({ fr: "Créditer des tokens", en: "Credit tokens", ar: "إضافة رصيد" })}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/reservations">
                <Plus />
                {tx({ fr: "Nouvelle réservation", en: "New booking", ar: "حجز جديد" })}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={cn("lift enter flex flex-col gap-2 rounded-[26px] p-5 shadow-sm", k.tone)}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold opacity-80">
              {k.label}
              <k.icon className="size-4 shrink-0" />
            </span>
            {loadingStats ? (
              <Skeleton className="h-11 w-20 bg-current/10" />
            ) : (
              <span className="disp text-[44px] leading-none">{k.value}</span>
            )}
            {k.bar !== undefined ? (
              <span className="h-2 overflow-hidden rounded-full bg-night/15">
                <span
                  className="block h-full rounded-full bg-night"
                  style={{ width: `${k.bar}%` }}
                />
              </span>
            ) : (
              k.sub && <span className="text-sm opacity-80">{k.sub}</span>
            )}
          </div>
        ))}
      </div>

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
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="flex ps-[112px] text-xs font-bold text-muted-foreground" dir="ltr">
                  <div className="relative h-5 flex-1">
                    {hours.map((h) => (
                      <span
                        key={h}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative mt-2 flex flex-col gap-2" dir="ltr">
                  {calendar.terrains.map(({ terrain, slots }) => (
                    <div key={terrain.id} className="flex items-stretch">
                      <span className="flex w-[112px] shrink-0 flex-col justify-center pe-3">
                        <span className="truncate text-[15px] font-extrabold">{terrain.name}</span>
                        <span className="text-xs capitalize text-muted-foreground">
                          {terrain.type}
                        </span>
                      </span>
                      <div className="relative h-[58px] flex-1 rounded-2xl bg-mist">
                        {slots
                          .filter((s) => s.reservationId)
                          .map((s) => {
                            const st = new Date(s.startTime),
                              en = new Date(s.endTime);
                            const h0 = st.getHours() + st.getMinutes() / 60,
                              h1 = en.getHours() + en.getMinutes() / 60 || 24;
                            const left = ((h0 - DAY_START) / (DAY_END - DAY_START)) * 100,
                              width = ((h1 - h0) / (DAY_END - DAY_START)) * 100;
                            if (left < 0 || left > 100) return null;
                            const tone = s.isPublic
                              ? "bg-ball text-night"
                              : s.status === "full" || s.bookingMode === "full_court"
                                ? "bg-court text-white"
                                : "bg-lilac text-night";
                            return (
                              <Link
                                key={s.startTime}
                                href="/admin/reservations"
                                title={`${s.creatorName ?? ""} ${format(st, "HH:mm")}–${format(en, "HH:mm")}`}
                                className={cn(
                                  "absolute inset-y-1 flex flex-col justify-center overflow-hidden rounded-xl px-2.5 transition-transform hover:-translate-y-0.5 hover:shadow-md",
                                  tone,
                                )}
                                style={{ left: `${left}%`, width: `calc(${width}% - 4px)` }}
                              >
                                <span className="truncate text-[13px] font-extrabold">
                                  {s.creatorName ??
                                    s.players[0]?.name ??
                                    tx({ fr: "Réservé", en: "Booked", ar: "محجوز" })}
                                </span>
                                <span className="truncate text-[11px] opacity-80">
                                  {s.filledSpots}/{s.totalSpots} · {format(st, "HH:mm")}
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
                      <span className="absolute -top-5 -translate-x-1/2 rounded-full bg-coral px-2 py-0.5 text-[11px] font-extrabold text-night">
                        {format(now, "HH:mm")}
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
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(activity ?? []).map((a) => {
                const Icon = activityIcon(a.type);
                return (
                  <li key={a.id} className="flex gap-3 rounded-2xl bg-white/6 p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ball">
                      <Icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold leading-snug">{a.message}</span>
                      <span className="text-xs text-muted-d">
                        {format(new Date(a.createdAt), "d MMM · HH:mm", { locale })}
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
            <ArrowRight className="size-4 rtl:scale-x-[-1]" />
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
                <Bar dataKey="rate" fill="#2E4CF6" radius={[10, 10, 10, 10]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </Page>
  );
}
