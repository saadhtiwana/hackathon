import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "signal" | "accent";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[12px] font-medium whitespace-nowrap tabular-nums",
        tone === "neutral" && "bg-surface-muted text-text-muted",
        tone === "ok" && "bg-tint-green text-tint-green-text",
        tone === "warn" && "bg-tint-yellow text-tint-yellow-text",
        tone === "signal" && "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
        tone === "accent" && "bg-accent-soft text-accent-text",
        className,
      )}
    >
      {children}
    </span>
  );
}
