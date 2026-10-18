import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface px-3 text-[14px] text-text hover:border-border-strong disabled:opacity-60 focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
