import type { CSSProperties } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastProps,
} from "@/components/ui/toast";
import { InfoIcon, WarningCircleIcon, WarningIcon } from "@/components/icons";

const DEFAULT_DURATION = 5000;
// Errors stay longer: people need time to read what went wrong.
const ERROR_DURATION = 7000;

/** Animated check drawn on success (plain toasts are confirmations). */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        className="check-path"
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToneIcon({ variant }: { variant: ToastProps["variant"] }) {
  const icon =
    variant === "destructive" ? (
      <WarningCircleIcon className="icon-pop size-[18px]" weight="fill" />
    ) : variant === "warning" ? (
      <WarningIcon className="icon-pop size-[18px]" weight="fill" />
    ) : variant === "info" ? (
      <InfoIcon className="icon-pop size-[18px]" weight="fill" />
    ) : (
      <DrawnCheck />
    );
  return (
    <span className="icon-pop relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--tone)] text-[var(--tone-fg)] shadow-[0_0_0_6px_color-mix(in_srgb,var(--tone)_18%,transparent)]">
      {icon}
    </span>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={DEFAULT_DURATION} swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, variant, duration, ...props }) {
        const ms = duration ?? (variant === "destructive" ? ERROR_DURATION : DEFAULT_DURATION);
        return (
          <Toast
            key={id}
            variant={variant}
            duration={ms}
            style={{ "--toast-duration": `${ms}ms` } as CSSProperties}
            {...props}
          >
            <ToneIcon variant={variant} />
            <div className="grid min-w-0 flex-1 gap-0.5 pt-1.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
            {Number.isFinite(ms) && (
              <span
                aria-hidden="true"
                className="toast-progress absolute inset-x-0 bottom-0 h-[3px] bg-[var(--tone)] opacity-70"
              />
            )}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
