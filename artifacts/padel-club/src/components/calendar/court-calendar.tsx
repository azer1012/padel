import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useGetCalendar } from "@workspace/api-client-react";
import type { CalendarSlot, CalendarTerrain } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  CalendarXIcon,
  GlobeIcon,
  LightningIcon,
  ProhibitIcon,
  SunIcon,
  WarehouseIcon,
  WrenchIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useTx, useI18n } from "@/lib/i18n";
import { clubTime, clubDay, clubDays, clubDayLabel } from "@/lib/club-time";
import { plural, playersLabel, tokensLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { EmptyState, LiveDot } from "@/components/smash/primitives";
import { BookDialog } from "./book-dialog";
import { MatchDialog } from "./match-dialog";
import { DialogHero, slotState, type SlotState, type Terrain } from "./shared";

type Modal =
  | { type: "book"; slot: CalendarSlot; terrain: Terrain }
  | { type: "match"; slot: CalendarSlot; terrain: Terrain }
  | null;

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
      return slot.reservationId
        ? tx({ fr: "Fermé", en: "Closed", ar: "مغلق" })
        : tx({ fr: "Indispo.", en: "Unavailable", ar: "غير متاح" });
    case "full":
      return isAdmin && slot.creatorName
        ? slot.creatorName
        : tx({ fr: "Complet", en: "Full", ar: "مكتمل" });
    case "partial":
      return tx({
        fr: `${slot.openSpots} ${plural(slot.openSpots, "place", "places")}`,
        en: `${slot.openSpots} open`,
        ar: `${slot.openSpots} شاغر`,
      });
    default:
      return slot.reservationId ? `${slot.filledSpots}/${slot.totalSpots}` : "";
  }
}

const slotKey = (terrainId: number, startTime: string) => `${terrainId}@${startTime}`;

export default function CourtCalendar({
  isAdmin = false,
  currentUserId = null,
}: {
  isAdmin?: boolean;
  currentUserId?: number | null;
}) {
  const tx = useTx();
  const { lang } = useI18n();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const days = useMemo(() => clubDays(14), []);
  const [dayIndex, setDayIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "indoor" | "outdoor">("all");
  const [modal, setModal] = useState<Modal>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const selectedDay = useRef<HTMLButtonElement>(null);

  const date = days[dayIndex];
  const { data, isLoading, isError, refetch } = useGetCalendar(
    { date },
    { query: { refetchInterval: 30_000, refetchOnWindowFocus: true } },
  );

  const terrains = (data?.terrains ?? []).filter(
    (t) => filter === "all" || t.terrain.type === filter,
  );
  // Whole club closed that day (holiday, closed weekday): every court reports a closure
  const closure =
    terrains.length > 0 && terrains.every((t) => t.closures?.some((c) => c.date === date))
      ? terrains[0].closures!.find((c) => c.date === date)
      : undefined;
  const closedReason = closure ? (closure.reason ?? "") : undefined;
  const times = useMemo(() => {
    const s = new Set<string>();
    terrains.forEach(({ slots }) =>
      slots.forEach((sl) => {
        if (clubDay(sl.startTime) === date) s.add(clubTime(sl.startTime));
      }),
    );
    return Array.from(s).sort();
  }, [terrains, date]);
  const slotAt = (t: CalendarTerrain, time: string) =>
    t.slots.find((s) => clubTime(s.startTime) === time && clubDay(s.startTime) === date);
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

  // Keep the chosen day visible in the strip (auto-advance, small screens)
  useEffect(() => {
    selectedDay.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [dayIndex]);

  // Today: scroll the first upcoming row into view
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-upcoming='true']");
    if (!el || !scroller.current) return;
    // Leave the sticky court header and the "now" marker above the row
    const head = scroller.current.querySelector("thead")?.offsetHeight ?? 64;
    scroller.current.scrollTop = Math.max(0, el.offsetTop - head - 34);
  }, [date, times.length]);

  // Keep an open dialog in sync with fresh data (another player joined, paid…)
  const live = (m: NonNullable<Modal>) => {
    const t = data?.terrains.find((x) => x.terrain.id === m.terrain.id);
    return t?.slots.find((s) => s.startTime === m.slot.startTime) ?? m.slot;
  };

  // Keyboard and screen-reader users land back on the slot they opened. The cell is
  // found again by its key: the planning may have been redrawn while the dialog was open.
  const opened = useRef<string | null>(null);
  const close = () => {
    setModal(null);
    const key = opened.current;
    opened.current = null;
    if (key)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-slot-key="${key}"]`)?.focus(),
      );
  };

  const open = (slot: CalendarSlot, terrain: Terrain) => {
    const st = slotState(slot);
    if (st === "past" && !slot.reservationId) return;
    opened.current = slotKey(terrain.id, slot.startTime);
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
    { state: "blocked", label: tx({ fr: "Indisponible", en: "Unavailable", ar: "غير متاح" }) },
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
        className="hscroll -mx-4 -my-2 scroll-px-4 gap-2 px-4 pb-5 pt-3 sm:mx-0 sm:scroll-px-1 sm:px-1"
      >
        {days.map((day, i) => {
          const on = i === dayIndex;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setDayIndex(i)}
              aria-pressed={on}
              aria-label={clubDayLabel(day, lang)}
              ref={on ? selectedDay : undefined}
              className={cn(
                "flex h-[82px] w-[64px] flex-col items-center justify-center gap-1 rounded-[22px] border-2 transition-[background-color,border-color,color,transform,box-shadow] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] active:scale-95",
                on
                  ? "-translate-y-1 border-ink bg-ink text-white shadow-[0_14px_28px_-14px_rgb(16_26_77/.8)]"
                  : "border-[#E4E8F7] bg-card hover:-translate-y-0.5 hover:border-[#C6CEF6]",
              )}
            >
              <span className="text-xs font-bold leading-none opacity-80">
                {i === 0
                  ? tx({ fr: "Auj.", en: "Today", ar: "اليوم" })
                  : clubDayLabel(day, lang, "weekdayShort")}
              </span>
              <span className="disp text-2xl leading-none">{Number(day.slice(8))}</span>
              <span className="text-[10px] font-bold uppercase leading-none opacity-70">
                {clubDayLabel(day, lang, "month")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="disp m-0 text-[22px] leading-tight sm:text-[26px]">
          {clubDayLabel(date, lang)}
        </h2>
        <div
          role="group"
          aria-label={tx({ fr: "Type de terrain", en: "Court type", ar: "نوع الملعب" })}
          className="pill-group"
        >
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className="pill-tab"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul
        aria-label={tx({ fr: "Légende", en: "Legend", ar: "مفتاح الألوان" })}
        className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-[13px] font-semibold text-muted-foreground"
      >
        {legend.map((l) => (
          <li key={l.state} className="flex items-center gap-2">
            <span className="slot size-4 rounded-md" data-state={l.state} />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <GlobeIcon className="size-4 text-[#7B5CF0]" />
          Open match
        </li>
        <li className="flex items-center gap-1.5">
          <LightningIcon className="size-4 text-[#B1452A]" />
          {tx({ fr: "Heures pleines", en: "Peak", ar: "ذروة" })}
        </li>
      </ul>

      {isError ? (
        <EmptyState
          icon={<CalendarXIcon className="size-7" />}
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
        <div
          className="-mx-4 grid grid-cols-3 gap-1.5 bg-card p-3 shadow-sm sm:mx-0 sm:grid-cols-4 sm:rounded-[28px] lg:grid-cols-6"
          aria-busy="true"
          aria-label={tx({
            fr: "Chargement du planning",
            en: "Loading schedule",
            ar: "جارٍ التحميل",
          })}
        >
          {Array.from({ length: 36 }, (_, i) => (
            <Skeleton key={i} className="h-[62px] w-full" />
          ))}
        </div>
      ) : terrains.length === 0 || times.length === 0 ? (
        <EmptyState
          icon={<CalendarXIcon className="size-7" />}
          title={
            closedReason !== undefined
              ? tx({
                  fr: "Club fermé ce jour-là",
                  en: "Club closed that day",
                  ar: "النادي مغلق في هذا اليوم",
                })
              : tx({
                  fr: "Aucun créneau ce jour-là",
                  en: "No slots that day",
                  ar: "لا مواعيد في هذا اليوم",
                })
          }
          text={
            closedReason
              ? closedReason
              : tx({
                  fr: "Essayez un autre jour ou un autre type de terrain.",
                  en: "Try another day or court type.",
                  ar: "جرّب يومًا أو نوع ملعب آخر.",
                })
          }
        />
      ) : (
        <>
          {/* Courts as columns, times as rows. Both headers stay visible while scrolling. */}
          <div
            ref={scroller}
            className="relative -mx-4 max-h-[min(72vh,760px)] overflow-auto overscroll-x-contain bg-card shadow-sm sm:mx-0 sm:rounded-[28px]"
          >
            <table
              className="w-full table-fixed border-separate border-spacing-1.5 p-1.5"
              style={{ minWidth: 64 + terrains.length * 104 }}
            >
              <caption className="sr-only">
                {tx({ fr: "Disponibilités", en: "Availability", ar: "المواعيد المتاحة" })}{" "}
                {clubDayLabel(date, lang, "longYear")}
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
                        <span className="line-clamp-2 break-words text-[14px] font-extrabold leading-tight sm:text-[15px]">
                          {ct.terrain.name}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          {ct.terrain.type === "outdoor" ? (
                            <SunIcon className="size-3" />
                          ) : (
                            <WarehouseIcon className="size-3" />
                          )}
                          {ct.terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
                        </span>
                        {ct.terrain.isMaintenance && (
                          <span
                            className="flex items-center gap-1 truncate text-xs font-bold text-[#9A4A12]"
                            title={ct.terrain.maintenanceNote ?? undefined}
                          >
                            <WrenchIcon className="size-3 shrink-0" />
                            {tx({ fr: "Maintenance", en: "Maintenance", ar: "صيانة" })}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {/* Keyed by day: switching date replays the cascade so the change is felt. */}
              <tbody key={date}>
                {times.map((time, row) => {
                  const past = rowIsPast(time);
                  const firstUpcoming = !past && (row === 0 || rowIsPast(times[row - 1]));
                  return (
                    <Fragment key={time}>
                      {firstUpcoming && dayIndex === 0 && row > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={terrains.length + 1} className="p-0">
                            <span className="flex items-center gap-2 py-0.5">
                              <span className="sticky start-1.5 flex h-5 items-center gap-1.5 rounded-full bg-coral px-2 text-[11px] font-extrabold text-night">
                                <span className="size-1.5 rounded-full bg-night" />
                                {tx({ fr: "Maintenant", en: "Now", ar: "الآن" })}
                              </span>
                              <span className="h-0.5 flex-1 rounded-full bg-coral/70" />
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr data-upcoming={firstUpcoming || undefined}>
                        <th
                          scope="row"
                          className="sticky start-0 z-10 bg-card pe-1 text-start align-middle"
                        >
                          <span
                            className={cn(
                              "text-[13px] font-extrabold",
                              past ? "text-[#5F6899]" : "text-ink",
                            )}
                            dir="ltr"
                          >
                            {time}
                          </span>
                        </th>
                        {terrains.map((ct, col) => {
                          const slot = slotAt(ct, time);
                          if (!slot) {
                            // A match that started earlier (e.g. booked before a duration change) still runs
                            const running = ct.slots.some(
                              (s) =>
                                s.reservationId &&
                                clubDay(s.startTime) === date &&
                                clubTime(s.startTime) < time &&
                                clubTime(s.endTime) > time,
                            );
                            return (
                              <td key={ct.terrain.id}>
                                <span className="flex h-[62px] items-center rounded-2xl bg-secondary/40 px-2 text-xs font-bold text-muted-foreground">
                                  {running ? tx({ fr: "Occupé", en: "In use", ar: "مشغول" }) : ""}
                                </span>
                              </td>
                            );
                          }
                          const st = slotState(slot);
                          const clickable = st !== "past" || !!slot.reservationId;
                          const label = cellLabel(st, slot, isAdmin, tx);
                          return (
                            <td key={ct.terrain.id}>
                              <button
                                type="button"
                                className={cn(
                                  "slot slot-in flex h-[62px] w-full flex-col justify-center px-2",
                                  slot.isPast && st !== "past" && "opacity-60",
                                )}
                                style={{
                                  animationDelay: `${Math.min(row * 18 + col * 12, 240)}ms`,
                                }}
                                data-state={st}
                                data-public={slot.isPublic || undefined}
                                data-slot-key={slotKey(ct.terrain.id, slot.startTime)}
                                disabled={!clickable}
                                onClick={() => open(slot, ct.terrain)}
                                aria-label={`${ct.terrain.name} ${time}: ${label || tx({ fr: "passé", en: "past", ar: "انتهى" })}${
                                  st === "available"
                                    ? `, ${tokensLabel(slot.tokensFullCourt)}`
                                    : slot.reservationId && !slot.isBlocked
                                      ? `, ${playersLabel(tx, slot.filledSpots, slot.totalSpots)}`
                                      : ""
                                }${slot.isPublic ? ", open match" : ""}`}
                              >
                                {st !== "past" || slot.reservationId ? (
                                  <>
                                    <span className="flex items-center justify-between gap-1 text-[13px] font-extrabold leading-tight">
                                      <span className="truncate">{label}</span>
                                      {slot.isPublic && st !== "mine" ? (
                                        <GlobeIcon className="size-3.5 shrink-0 text-[#7B5CF0]" />
                                      ) : slot.isPeak && st === "available" ? (
                                        <LightningIcon className="size-3.5 shrink-0 text-[#B1452A]" />
                                      ) : null}
                                    </span>
                                    {st === "available" ? (
                                      <span className="mt-0.5 text-[11px] font-semibold opacity-80">
                                        {tx({ fr: "dès ", en: "from ", ar: "من " })}
                                        {tokensLabel(slot.tokensPerSpot ?? slot.tokensFullCourt)}
                                      </span>
                                    ) : st === "blocked" ? (
                                      <ProhibitIcon className="mt-1 size-3.5 opacity-70" />
                                    ) : (
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
                                    )}
                                  </>
                                ) : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
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

      <Dialog open={!!current} onOpenChange={(o) => !o && close()}>
        {current && (
          <DialogContent className="max-w-[540px]">
            <DialogHero terrain={current.terrain} slot={current.slot} />
            {current.type === "book" ? (
              <BookDialog
                slot={current.slot}
                terrain={current.terrain}
                isAdmin={isAdmin}
                onClose={close}
              />
            ) : (
              <MatchDialog
                slot={current.slot}
                terrain={current.terrain}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onClose={close}
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
