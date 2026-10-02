import { useState } from "react";
import { TrophyIcon } from "@/components/icons";
import { CourtLines } from "@/components/smash/primitives";
import { cn } from "@/lib/utils";

const COURT_TONES = ["bg-court/70", "bg-[#3a2f8f]", "bg-[#1b6f52]"];

/**
 * Cover of a tournament card. Shows the tournament's own photo when the club added
 * one; otherwise a drawn court in the club colours, so a list of tournaments never
 * repeats the same stock picture. `seed` (the tournament id) varies the court colour.
 */
export function EventCover({
  src,
  seed = 0,
  className,
  imgClassName,
}: {
  src?: string | null;
  seed?: number;
  className?: string;
  imgClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (src && !broken)
    return (
      <span className={cn("photo block", className)}>
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={cn("size-full object-cover", imgClassName)}
        />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={cn("on-dark relative block overflow-hidden bg-night text-white", className)}
    >
      <span
        className={cn(
          "absolute -end-10 -top-10 h-[150%] w-[78%] rotate-[-9deg] rounded-xl border-[3px] border-white/25 transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:rotate-[-6deg] group-hover:scale-105",
          COURT_TONES[Math.abs(seed) % COURT_TONES.length],
        )}
      >
        <CourtLines />
      </span>
      <TrophyIcon
        weight="duotone"
        className="absolute bottom-4 end-5 size-14 text-ball drop-shadow-[0_6px_14px_rgb(10_16_48/.5)]"
      />
    </span>
  );
}
