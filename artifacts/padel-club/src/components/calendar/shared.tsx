import {
  getCalendarQueryKey,
  getListReservationsQueryKey,
  getListUpcomingReservationsQueryKey,
  getGetTokenBalanceQueryKey,
  getOpenMatchesQueryKey,
  extrasKeys,
} from "@workspace/api-client-react";
import type { CalendarSlot, CalendarTerrain } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LightningIcon, SunIcon, WarehouseIcon } from "@/components/icons";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CourtLines } from "@/components/smash/primitives";
import { useTx, useI18n } from "@/lib/i18n";
import { clubTime, clubDay, clubDate } from "@/lib/club-time";

export type Terrain = CalendarTerrain["terrain"];
export type SlotState = "available" | "partial" | "full" | "mine" | "past" | "blocked";

export function slotState(slot: CalendarSlot): SlotState {
  if (slot.isMine) return "mine";
  if (slot.isBlocked) return "blocked";
  if (slot.isPast || slot.status === "past") return "past";
  // Outside the club's booking window (too soon / too far ahead) or court in maintenance
  if (slot.status === "available" && slot.bookable === false) return "blocked";
  if (slot.status === "available") return "available";
  if (slot.status === "full") return "full";
  return "partial";
}

/** Invalidate everything a booking action can change. */
export function useRefreshBookings() {
  const qc = useQueryClient();
  return (startTime: string) => {
    qc.invalidateQueries({ queryKey: getCalendarQueryKey({ date: clubDay(startTime) }) });
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListUpcomingReservationsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTokenBalanceQueryKey() });
    qc.invalidateQueries({ queryKey: getOpenMatchesQueryKey() });
    qc.invalidateQueries({ queryKey: extrasKeys.equipmentAll });
  };
}

/** Header shared by the booking and the match dialogs: court, day and time. */
export function DialogHero({
  terrain,
  slot,
  children,
}: {
  terrain: Terrain;
  slot: CalendarSlot;
  children?: React.ReactNode;
}) {
  const tx = useTx();
  const { lang } = useI18n();
  const photo = terrain.photos?.[0];
  return (
    <div className="on-dark relative -mx-6 -mt-6 overflow-hidden rounded-t-[32px] bg-night px-6 pb-6 pt-7 text-white sm:-mx-8 sm:-mt-8 sm:px-8">
      {photo ? (
        <>
          <img
            src={photo}
            alt=""
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
          {/* Keeps the white text readable on any photo */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,rgb(10_16_48/.92)_35%,rgb(10_16_48/.55))] rtl:bg-[linear-gradient(270deg,rgb(10_16_48/.92)_35%,rgb(10_16_48/.55))]"
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="absolute -end-10 -top-6 h-[120px] w-[220px] rotate-[-9deg] rounded-lg border-[3px] border-white/15 bg-court/40"
        >
          <CourtLines />
        </div>
      )}
      <DialogHeader className="relative text-start">
        <span className="label flex items-center gap-2 text-ball">
          {terrain.type === "outdoor" ? (
            <SunIcon className="size-4" />
          ) : (
            <WarehouseIcon className="size-4" />
          )}
          {terrain.type === "outdoor" ? "Outdoor" : "Indoor"}
          {slot.isPeak && (
            <span className="flex items-center gap-1 rounded-full bg-coral px-2.5 py-0.5 text-[11px] font-extrabold normal-case tracking-normal text-night">
              <LightningIcon className="size-3" />
              {slot.priceLabel ||
                tx({ fr: "Heures pleines", en: "Peak hours", ar: "ساعات الذروة" })}
            </span>
          )}
        </span>
        <DialogTitle className="text-[32px] leading-none text-white">{terrain.name}</DialogTitle>
        <DialogDescription className="text-base text-soft-d">
          {clubDate(slot.startTime, lang)} ·{" "}
          <span className="font-bold text-white" dir="ltr">
            {clubTime(slot.startTime)} – {clubTime(slot.endTime)}
          </span>
        </DialogDescription>
        {children}
      </DialogHeader>
    </div>
  );
}
