import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-2xl bg-ink/[.06]", className)} {...props} />;
}

export { Skeleton };
