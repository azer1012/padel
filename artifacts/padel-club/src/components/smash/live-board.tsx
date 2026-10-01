import { useMemo, useState } from "react";
import { Link } from "wouter";
import { addDays, format, isSameDay } from "date-fns";
import { useGetCalendar } from "@workspace/api-client-react";
import type { CalendarSlot, CalendarTerrain } from "@workspace/api-client-react";
import { ArrowRightIcon, HandTapIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CourtLines, LiveDot } from "@/components/smash/primitives";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clubTime } from "@/lib/club-time";
import { useClubRules } from "@/hooks/use-club-rules";

type CourtState = "free" | "partial" | "busy" | "selected";
const hhmm = (iso: string) => clubTime(iso);

function isBookable(s?: CalendarSlot) {
  return !!s && s.status === "available";
}
function isJoinable(s?: CalendarSlot) {
  return !!s && s.status === "partial" && s.bookingMode === "own_spot" && s.openSpots > 0;
}

/** Today's (or tomorrow's, late at night) availability grouped by start time. */
export function useTonight() {
  const today = new Date();
  const q1 = useGetCalendar(
    { date: format(today, "yyyy-MM-dd") },
    { query: { refetchInterval: 60_000 } as any },
  );
  const todayHasFuture = (q1.data?.terrains ?? []).some((t) =>
    t.slots.some((s) => s.status !== "past" && isSameDay(new Date(s.startTime), today)),
  );
  const tomorrow = addDays(today, 1);
  const q2 = useGetCalendar(
    { date: format(tomorrow, "yyyy-MM-dd") },
    { query: { enabled: q1.isSuccess && !todayHasFuture } as any },
  );
  const useTomorrow = q1.isSuccess && !todayHasFuture;
  const q = useTomorrow ? q2 : q1;
  const day = useTomorrow ? tomorrow : today;

  const terrains: CalendarTerrain[] = useMemo(() => q.data?.terrains ?? [], [q.data]);
  const times = useMemo(() => {
    const s = new Set<string>();
    terrains.forEach((t) =>
      t.slots.forEach((sl) => {
        if (sl.status !== "past" && isSameDay(new Date(sl.startTime), day))
          s.add(hhmm(sl.startTime));
      }),
    );
    return Array.from(s).sort();
  }, [terrains, day]);
  const slotAt = (t: CalendarTerrain, time: string) =>
    t.slots.find((s) => hhmm(s.startTime) === time && isSameDay(new Date(s.startTime), day));
  const freeAt = (time: string) => terrains.filter((t) => isBookable(slotAt(t, time))).length;
  return { ...q, terrains, times, slotAt, freeAt, isTomorrow: useTomorrow };
}

export function LiveBoard({
  tonight,
  timeIndex,
  onTime,
}: {
  tonight: ReturnType<typeof useTonight>;
  timeIndex: number;
  onTime: (i: number) => void;
}) {
  const rules = useClubRules();
  const tx = useTx();
  const [selected, setSelected] = useState<number | null>(null);
  const { terrains, times, slotAt, isLoading, isError } = tonight;
  const tabs = times.slice(0, 4);
  const time = tabs[Math.min(timeIndex, tabs.length - 1)];
  const courts = terrains.slice(0, 6);

  if (isError) return null;
  if (isLoading || !time) {
    return (
      <div className="hidden flex-col items-center gap-6 lg:flex" aria-busy="true">
        <div className="skeleton-dark h-[76px] w-[460px] animate-pulse" />
        <div className="grid w-full grid-cols-3 gap-5 p-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-dark h-[150px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const states = courts.map((t) => {
    const s = slotAt(t, time);
    let next: string | null = null;
    for (const later of times.slice(times.indexOf(time) + 1)) {
      if (isBookable(slotAt(t, later))) {
        next = later;
        break;
      }
    }
    const base: CourtState = isBookable(s) ? "free" : isJoinable(s) ? "partial" : "busy";
    const state: CourtState = base !== "busy" && selected === t.terrain.id ? "selected" : base;
    return { t, s, next, state, base };
  });
  const sel = states.find((c) => c.state === "selected");
  const chip = (c: (typeof states)[number]) =>
    c.state === "selected"
      ? tx({ fr: "Le vôtre", en: "Yours", ar: "لك" })
      : c.state === "free"
        ? tx({ fr: "Libre", en: "Free", ar: "متاح" })
        : c.state === "partial"
          ? tx({
              fr: `${c.s?.openSpots} place(s)`,
              en: `${c.s?.openSpots} spot(s)`,
              ar: `${c.s?.openSpots} مكان`,
            })
          : c.next
            ? tx({ fr: `Libre à ${c.next}`, en: `Free at ${c.next}`, ar: `متاح ${c.next}` })
            : tx({ fr: "Réservé", en: "Booked", ar: "محجوز" });

  const tabsEl = (mobile = false) => (
    <div
      role="tablist"
      aria-label={tx({ fr: "Heure de début", en: "Start time", ar: "وقت البدء" })}
      className={
        mobile
          ? "hscroll -mx-5 gap-2 px-5"
          : "flex gap-1.5 rounded-3xl border border-white/10 bg-white/6 p-1.5"
      }
    >
      {tabs.map((tm, i) => {
        const n = tonight.freeAt(tm);
        return (
          <button
            key={tm}
            type="button"
            role="tab"
            aria-selected={tm === time}
            onClick={() => {
              onTime(i);
              setSelected(null);
            }}
            className={cn(
              "flex min-w-[104px] flex-col items-start gap-0.5 rounded-[18px] px-4 py-3 text-start text-white transition-colors hover:bg-white/8 aria-selected:bg-white aria-selected:text-night",
              mobile && "min-w-[92px] items-center bg-white/7",
            )}
          >
            <span className="text-[17px] font-extrabold" dir="ltr">
              {tm}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold opacity-80">
              <span
                className="size-[7px] rounded-full"
                style={{ background: n >= 2 ? "var(--color-ball)" : "var(--color-coral)" }}
              />
              {tx({ fr: `${n} libre(s)`, en: `${n} free`, ar: `${n} متاح` })}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Desktop: tilted aerial board */}
      <div className="enter-late relative hidden flex-col items-center gap-2 lg:flex">
        {tabsEl()}
        <div className="stage w-full px-5 pt-5">
          <div className="board grid grid-cols-3 gap-[22px] rounded-[28px] bg-night-2 p-[26px] shadow-[0_60px_80px_-40px_rgb(0_0_0/.8)]">
            {states.map((c, i) => (
              <button
                key={c.t.terrain.id}
                type="button"
                className="court h-[150px]"
                data-state={c.state}
                disabled={c.base === "busy"}
                aria-pressed={c.state === "selected"}
                onClick={() => setSelected(c.state === "selected" ? null : c.t.terrain.id)}
                aria-label={`${c.t.terrain.name}: ${chip(c)}`}
              >
                <CourtLines />
                <span className="disp absolute end-2.5 top-1.5 text-[26px] opacity-90">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="absolute start-2.5 top-2.5 max-w-[60%] truncate text-xs font-bold opacity-80">
                  {c.t.terrain.name}
                </span>
                {c.base !== "free" &&
                  [
                    "start-[24%] top-[30%]",
                    "start-[30%] top-[60%]",
                    "start-[64%] top-[32%]",
                    "start-[68%] top-[62%]",
                  ]
                    .slice(0, c.s?.filledSpots ?? 4)
                    .map((p) => (
                      <span
                        key={p}
                        className={`absolute ${p} size-3.5 rounded-full border-2 border-night-3 bg-coral`}
                      />
                    ))}
                <span
                  className={cn(
                    "absolute bottom-2.5 start-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold",
                    c.state === "selected"
                      ? "bg-night text-ball"
                      : c.state === "free"
                        ? "bg-ball text-night"
                        : c.state === "partial"
                          ? "bg-lilac text-night"
                          : "bg-white/10 text-soft-d",
                  )}
                >
                  {c.state === "busy" && c.next && <LiveDot className="!size-[7px]" />}
                  {chip(c)}
                </span>
              </button>
            ))}
          </div>
        </div>
        {sel ? (
          <div
            key={`${sel.t.terrain.id}-${time}`}
            className="enter relative -mt-6 flex w-full max-w-[640px] items-center gap-5 rounded-[26px] bg-white py-4 pe-4 ps-6 text-ink shadow-[0_40px_60px_-30px_rgb(0_0_0/.7)]"
            aria-live="polite"
          >
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="disp text-[26px] tracking-[-0.02em]">{sel.t.terrain.name}</span>
              <span className="text-[15px] text-muted-foreground" dir="ltr">
                {time} – {sel.s ? hhmm(sel.s.endTime) : ""}
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5 pe-1.5">
              <span className="disp text-[26px] tracking-[-0.02em]">
                {sel.base === "free" ? rules.tokenCostFullCourt : rules.tokenCostPlayer} tokens
              </span>
              <span className="text-sm font-bold text-success">
                {sel.base === "free"
                  ? tx({
                      fr: "ou 1 token pour votre place",
                      en: "or 1 token for your spot",
                      ar: "أو رصيد واحد لمكانك",
                    })
                  : tx({ fr: "pour rejoindre", en: "to join", ar: "للانضمام" })}
              </span>
            </span>
            <Button asChild>
              <Link href="/terrains">
                {tx({ fr: "Réserver", en: "Book it", ar: "احجز" })}
                <ArrowRightIcon className="btn-ic" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="enter relative -mt-6 flex w-full max-w-[560px] items-center gap-4 rounded-3xl border border-white/14 bg-white/8 px-5 py-4 text-white">
            <HandTapIcon className="size-7 shrink-0 text-ball" />
            <span className="text-base leading-snug">
              {tx({
                fr: "Touchez un terrain lumineux pour le garder. Les terrains occupés indiquent quand ils se libèrent.",
                en: "Tap a glowing court to hold it. Busy courts show when they free up.",
                ar: "اضغط على ملعب مضيء لحجزه. الملاعب المشغولة تُظهر وقت توفرها.",
              })}
            </span>
          </div>
        )}
      </div>

      {/* Mobile: time chips + swipeable cards */}
      <div className="flex flex-col gap-4 lg:hidden">
        {tabsEl(true)}
        <div
          role="group"
          aria-label={tx({ fr: "Terrains", en: "Courts", ar: "الملاعب" })}
          className="hscroll -mx-5 gap-3 px-5 pb-1"
        >
          {[...states]
            .sort((a, b) => Number(a.base === "busy") - Number(b.base === "busy"))
            .map((c) => (
              <Link
                key={c.t.terrain.id}
                href="/terrains"
                className={cn(
                  "flex w-[240px] flex-col gap-3 rounded-[26px] p-3",
                  c.base === "busy" ? "bg-white/4 text-white/80" : "bg-white/8 text-white",
                )}
              >
                <span
                  className="relative h-[120px] rounded-xl border-[3px]"
                  style={{
                    background:
                      c.base === "free"
                        ? "var(--color-court)"
                        : c.base === "partial"
                          ? "#3A2F8F"
                          : "var(--color-night-3)",
                    borderColor: c.base === "busy" ? "rgb(255 255 255 / .3)" : "#fff",
                  }}
                >
                  <CourtLines />
                </span>
                <span className="flex items-center justify-between gap-2 px-1">
                  <span className="truncate text-[16px] font-extrabold">{c.t.terrain.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold",
                      c.base === "free"
                        ? "bg-ball text-night"
                        : c.base === "partial"
                          ? "bg-lilac text-night"
                          : "bg-white/10 text-soft-d",
                    )}
                  >
                    {chip(c)}
                  </span>
                </span>
              </Link>
            ))}
        </div>
      </div>
    </>
  );
}
