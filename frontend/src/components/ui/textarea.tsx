import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-[14px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
