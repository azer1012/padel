import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "@/components/icons";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

/** Top of the screen on phones (clear of the bottom tab bar), bottom-right on desktop. */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed inset-x-0 top-0 z-[100] mx-auto flex max-h-screen w-full flex-col gap-2.5 p-3 pt-[max(12px,env(safe-area-inset-top))] outline-none [--toast-from:-28px] sm:inset-x-auto sm:bottom-0 sm:end-0 sm:top-auto sm:flex-col-reverse sm:p-6 sm:[--toast-from:28px] md:max-w-[440px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

/** `--tone` drives the icon badge, the countdown bar and the edge glow. */
const toastVariants = cva(
  "toast group pointer-events-auto relative flex w-full items-start gap-3.5 overflow-hidden rounded-[22px] bg-night p-4 pe-12 text-white shadow-[0_24px_48px_-20px_rgb(10_16_48/.65),inset_0_0_0_1px_rgb(255_255_255/.08)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] [--toast-out:110%] rtl:[--toast-out:-110%]",
  {
    variants: {
      variant: {
        default: "[--tone:var(--color-ball)] [--tone-fg:var(--color-night)]",
        success: "[--tone:var(--color-ball)] [--tone-fg:var(--color-night)]",
        info: "[--tone:#7d93ff] [--tone-fg:var(--color-night)]",
        warning: "[--tone:var(--color-star)] [--tone-fg:var(--color-night)]",
        destructive: "destructive [--tone:var(--color-coral)] [--tone-fg:var(--color-night)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-9 shrink-0 items-center justify-center self-center rounded-full bg-white/10 px-4 text-sm font-bold text-white transition-[background-color,transform] hover:bg-white/20 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute end-3 top-3 flex size-8 items-center justify-center rounded-full text-white/50 transition-[color,background-color,transform] hover:rotate-90 hover:bg-white/10 hover:text-white",
      className,
    )}
    toast-close=""
    aria-label="Close"
    {...props}
  >
    <XIcon className="size-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-[15px] font-bold leading-snug", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm leading-relaxed text-soft-d", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
