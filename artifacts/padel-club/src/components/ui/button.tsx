import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { SpinnerIcon } from "@/components/icons";

import { cn } from "@/lib/utils";

/**
 * Club button language.
 * Hover: 2px lift + colour sweep, icons nudge. Press: scale .97 + ripple from the
 * pointer. `loading` swaps the leading icon for a spinner and blocks clicks.
 */
const buttonVariants = cva(
  "sweep inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold transition-[transform,box-shadow,color,opacity,background-color] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[.97] active:duration-75 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-busy:!opacity-100 [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-[cubic-bezier(.3,1.4,.5,1)] hover:[&_svg:not(.btn-ic):not(.spin)]:scale-110",
  {
    variants: {
      variant: {
        default:
          "bg-court text-white [--fill:var(--color-court-deep)] shadow-[0_12px_28px_-14px_rgb(46_76_246/.9)] hover:shadow-[0_18px_36px_-16px_rgb(46_76_246/1)]",
        lime: "bg-ball text-night [--fill:#fff] shadow-[0_10px_24px_-16px_rgb(120_140_0/.9)] hover:shadow-[0_18px_40px_-18px_rgb(221_247_74/.8)]",
        dark: "bg-ink text-white [--fill:var(--color-court)] shadow-[0_12px_28px_-16px_rgb(10_16_48/.8)]",
        destructive:
          "bg-destructive text-destructive-foreground [--fill:#C9353A] shadow-[0_12px_28px_-16px_rgb(201_53_58/.9)]",
        outline:
          "bg-transparent text-foreground shadow-[inset_0_0_0_1.5px_rgb(16_26_77/.2)] [--fill:var(--color-ink)] hover:text-white hover:shadow-[inset_0_0_0_1.5px_var(--color-ink)]",
        "outline-dark":
          "bg-transparent text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.35)] [--fill:rgb(255_255_255/.12)] hover:shadow-[inset_0_0_0_1.5px_#fff]",
        "outline-destructive":
          "bg-transparent text-destructive shadow-[inset_0_0_0_1.5px_hsl(var(--destructive)/.4)] [--fill:hsl(var(--destructive)/.1)] hover:shadow-[inset_0_0_0_1.5px_hsl(var(--destructive))]",
        secondary: "bg-secondary text-secondary-foreground [--fill:#DCE2F8]",
        ghost: "bg-transparent hover:translate-y-0 hover:bg-foreground/5",
        link: "rounded-none text-primary underline-offset-4 hover:translate-y-0 hover:underline",
      },
      size: {
        default: "h-12 px-6 text-[15px]",
        sm: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-14 px-8 text-base [&_svg]:size-5",
        xl: "h-[72px] px-10 text-lg [&_svg]:size-6",
        icon: "size-11 [&_svg]:size-5",
        "icon-sm": "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner in place of the leading icon, disables the button, sets aria-busy. */
  loading?: boolean;
}

/** Two clicks closer than this are one press (a double-click, a bouncing touch). */
const DOUBLE_CLICK_MS = 500;

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Ink ripple from the press point; removed as soon as it has played. */
function spawnRipple(e: React.PointerEvent<HTMLElement>) {
  if (e.button !== 0 || reduceMotion()) return;
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const dot = document.createElement("span");
  dot.className = "ripple";
  dot.setAttribute("aria-hidden", "true");
  dot.style.setProperty("--rx", `${e.clientX - rect.left}px`);
  dot.style.setProperty("--ry", `${e.clientY - rect.top}px`);
  dot.style.setProperty("--rs", `${size}px`);
  el.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove(), { once: true });
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading: loadingProp,
      disabled,
      children,
      onPointerDown,
      onClick,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const loading = loadingProp ?? false;
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(e);
      if (variant !== "link") spawnRipple(e);
    };
    // A button with a loading state starts one action per press: the second click of
    // a double-click arrives before "loading" has been rendered, and would send the
    // request twice (also stops the form submit when the button is type="submit").
    const lastClick = React.useRef(0);
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (loadingProp !== undefined) {
        const now = Date.now();
        if (now - lastClick.current < DOUBLE_CLICK_MS) {
          e.preventDefault();
          return;
        }
        lastClick.current = now;
      }
      onClick?.(e);
    };

    // An icon alone is ambiguous: its accessible name is also shown on hover
    const iconOnly = size === "icon" || size === "icon-sm";

    let content = children;
    if (loading && !asChild) {
      // Replace the leading icon (if any) with the spinner so the label never jumps.
      const items = React.Children.toArray(children);
      const leadingIcon =
        React.isValidElement(items[0]) && typeof items[0].type !== "string" ? 1 : 0;
      content = (
        <>
          <SpinnerIcon className="spin" />
          {items.slice(leadingIcon)}
        </>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        title={iconOnly ? props["aria-label"] : undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
