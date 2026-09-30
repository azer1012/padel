import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" +
    "",
  {
    variants: {
      variant: {
        default: "border-transparent bg-court text-white",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-xs",
        outline: "text-foreground border [border-color:var(--badge-outline)]",
        lime: "border-transparent bg-ball text-night",
        success: "border-transparent bg-[#DDF5E7] text-[#0F6B3C]",
        warning: "border-transparent bg-[#FFEBD9] text-[#9A4A12]",
        danger: "border-transparent bg-[#FDE4E4] text-[#A3262B]",
        muted: "border-transparent bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
