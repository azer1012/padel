import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowsClockwiseIcon, IconWeightProvider, WarningCircleIcon } from "@/components/icons";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Animated number: counts from the previous value to the new one (ease-out, ~0.9s).
 * Screen readers get the final value straight away.
 */
export function CountUp({
  value,
  duration = 900,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const still = prefersReducedMotion() || !Number.isFinite(value);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = origin + (value - origin) * (1 - Math.pow(1 - t, 4));
      from.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, still]);
  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden="true">{format(still ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

export function LiveDot({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("live-dot", className)}
      style={color ? ({ "--dot": color } as React.CSSProperties) : undefined}
    />
  );
}

export function Eyebrow({
  children,
  className,
  live,
  liveColor,
}: {
  children: ReactNode;
  className?: string;
  live?: boolean;
  liveColor?: string;
}) {
  return (
    <span className={cn("label flex items-center gap-3", className)}>
      {live && <LiveDot color={liveColor} />}
      {children}
    </span>
  );
}

/** Aerial court lines, reused by the hero board, booking cards and illustrations. */
export function CourtLines({ thick = 3 }: { thick?: number }) {
  return (
    <>
      <span
        className="court-line"
        style={{
          top: 0,
          bottom: 0,
          left: "50%",
          width: thick,
          marginLeft: -thick / 2,
          background: "#fff",
        }}
      />
      <span className="court-line" style={{ top: 0, bottom: 0, left: "15%", width: 2 }} />
      <span className="court-line" style={{ top: 0, bottom: 0, left: "85%", width: 2 }} />
      <span className="court-line" style={{ left: "15%", right: "15%", top: "50%", height: 2 }} />
    </>
  );
}

/** Consistent header for every app page. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "enter flex flex-col gap-5 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && <span className="label text-court">{eyebrow}</span>}
        <h1 className="disp m-0 text-[clamp(36px,5vw,56px)] leading-[0.95]">{title}</h1>
        {subtitle && (
          <p className="m-0 max-w-[620px] text-base leading-relaxed text-muted-foreground md:text-lg">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/** Page container used inside the app shell. */
export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 lg:gap-10 lg:px-10 lg:pb-16 lg:pt-10",
        wide ? "max-w-[1400px]" : "max-w-[1120px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  dark,
}: {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "enter flex flex-col items-center gap-4 rounded-[28px] border-2 border-dashed px-6 py-14 text-center",
        dark ? "border-white/20 text-white" : "border-[#DCE2F8] bg-card/50",
      )}
    >
      {icon && (
        <span
          className={cn(
            "pop-in relative flex size-16 items-center justify-center rounded-full [&_svg]:size-8",
            dark ? "bg-white/10 text-ball" : "bg-ball text-night",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute -inset-2 rounded-full border-2 border-dashed opacity-60",
              dark ? "border-white/20" : "border-ball",
            )}
          />
          <IconWeightProvider weight="duotone">{icon}</IconWeightProvider>
        </span>
      )}
      <span className="disp text-2xl tracking-[-0.02em]">{title}</span>
      {text && (
        <p
          className={cn(
            "m-0 max-w-[420px] text-[15px] leading-relaxed",
            dark ? "text-muted-d" : "text-muted-foreground",
          )}
        >
          {text}
        </p>
      )}
      {action}
    </div>
  );
}

export function ErrorState({
  text,
  onRetry,
  retryLabel = "Réessayer",
}: {
  text: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="enter flex flex-col items-start gap-4 rounded-[24px] bg-[#FDE4E4] p-5 text-[#7A1C20] sm:flex-row sm:items-center"
    >
      <span className="flex flex-1 items-center gap-3 text-[15px] font-semibold">
        <span className="icon-pop flex size-10 shrink-0 items-center justify-center rounded-full bg-white/70">
          <WarningCircleIcon className="size-5" weight="duotone" />
        </span>
        {text}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="group flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#7A1C20] shadow-[0_6px_16px_-10px_rgb(122_28_32/.6)] transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <ArrowsClockwiseIcon className="size-4 transition-transform duration-500 group-hover:rotate-180" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Initials avatar with brand colours cycling by index. */
const AVATAR = [
  ["#2E4CF6", "#fff"],
  ["#FF8A6B", "#0A1030"],
  ["#CBBDFF", "#0A1030"],
  ["#DDF74A", "#0A1030"],
];
export function Avatar({
  name = "",
  index = 0,
  size = 44,
  className,
  ring,
}: {
  name?: string | null;
  index?: number;
  size?: number;
  className?: string;
  ring?: string;
}) {
  const [bg, fg] = AVATAR[index % AVATAR.length];
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: size * 0.32,
        boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
      }}
    >
      {initials}
    </span>
  );
}
