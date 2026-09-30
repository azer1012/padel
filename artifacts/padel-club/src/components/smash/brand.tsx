import { Link } from "wouter";
import { CLUB } from "@/config/club";
import { cn } from "@/lib/utils";

export function BallMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 8c5 2 5 10 0 12" />
      <path d="M23 8c-5 2-5 10 0 12" />
    </svg>
  );
}

export function BallIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="14" cy="14" r="11" />
      <path d="M5 8c5 2 5 10 0 12" />
      <path d="M23 8c-5 2-5 10 0 12" />
    </svg>
  );
}

export function Logo({
  href = "/",
  tone = "light",
  compact = false,
  onClick,
}: {
  href?: string;
  tone?: "light" | "dark";
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={`${CLUB.name}`}
      className={cn("flex items-center gap-3", tone === "light" ? "text-white" : "text-ink")}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ball text-night lg:size-10">
        <BallMark />
      </span>
      {!compact && (
        <span className="disp text-[20px] tracking-[-0.02em] lg:text-[22px]">{CLUB.name}</span>
      )}
    </Link>
  );
}
