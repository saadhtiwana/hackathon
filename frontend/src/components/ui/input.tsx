import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink shadow-[0_1px_1px_rgba(16,24,40,0.03)] placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}
