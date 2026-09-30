import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[110px] w-full rounded-2xl border border-input bg-card px-4 py-3 text-base font-medium placeholder:font-normal placeholder:text-muted-foreground/80 hover:border-[#C6CEF6] focus-visible:border-court focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-court/15 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
