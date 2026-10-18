import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}
