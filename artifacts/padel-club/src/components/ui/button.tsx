import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Smash Padel button language.
 * Hover: 2px lift + colour sweep. Press: scale .97. Everything under 200ms.
 */
const buttonVariants = cva(
  "sweep inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold transition-[transform,box-shadow,color,opacity] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[.97] active:duration-75 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-court text-white [--fill:var(--color-court-deep)] shadow-[0_12px_28px_-14px_rgb(46_76_246/.9)] hover:shadow-[0_18px_36px_-16px_rgb(46_76_246/1)]",
        lime:
          "bg-ball text-night [--fill:#fff] hover:shadow-[0_18px_40px_-18px_rgb(221_247_74/.8)]",
        dark:
          "bg-ink text-white [--fill:var(--color-court)]",
        destructive:
          "bg-destructive text-destructive-foreground [--fill:#C9353A]",
        outline:
          "bg-transparent text-foreground shadow-[inset_0_0_0_1.5px_rgb(16_26_77/.2)] [--fill:var(--color-ink)] hover:text-white hover:shadow-[inset_0_0_0_1.5px_var(--color-ink)]",
        "outline-dark":
          "bg-transparent text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.35)] [--fill:rgb(255_255_255/.12)] hover:shadow-[inset_0_0_0_1.5px_#fff]",
        "outline-destructive":
          "bg-transparent text-destructive shadow-[inset_0_0_0_1.5px_hsl(var(--destructive)/.4)] [--fill:hsl(var(--destructive)/.1)]",
        secondary:
          "bg-secondary text-secondary-foreground [--fill:#DCE2F8]",
        ghost: "bg-transparent hover:translate-y-0 hover:bg-foreground/5",
        link: "rounded-none text-primary underline-offset-4 hover:translate-y-0 hover:underline",
      },
      size: {
        default: "h-12 px-6 text-[15px]",
        sm: "h-10 px-4 text-sm",
        lg: "h-14 px-8 text-base",
        xl: "h-[72px] px-10 text-lg",
        icon: "size-11",
        "icon-sm": "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
