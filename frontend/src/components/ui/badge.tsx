import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "signal";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[12px] font-medium tabular-nums",
        tone === "neutral" && "bg-wash text-muted",
        tone === "ok" && "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok",
        tone === "warn" && "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-warn",
        tone === "signal" && "bg-[color-mix(in_srgb,var(--signal)_12%,transparent)] text-signal",
        className,
      )}
    >
      {children}
    </span>
  );
}
