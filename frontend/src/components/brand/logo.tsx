import { cn } from "@/lib/cn";

// Two batons, one passing to the next: a lead is always in exactly one hand. Colours follow the theme through CSS variables.
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Relay" className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="var(--logo-tile)" />
      <g transform="rotate(-45 32 32)">
        <rect x="4" y="25" width="33" height="14" rx="7" fill="var(--logo-a)" />
        <rect x="27" y="25" width="33" height="14" rx="7" fill="var(--logo-b)" stroke="var(--logo-tile)" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

export function Lockup({ size = 28, className, textClassName }: { size?: number; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className={cn("text-[19px] leading-none font-semibold tracking-[-0.02em] lowercase", textClassName)}>relay</span>
    </span>
  );
}

// Workspace chip: 28px ink square, paper initials in IBM Plex Mono.
export function WorkspaceAvatar({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const initials = ((words[0]?.[0] ?? "R") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--logo-tile)] text-[11px] font-semibold text-[var(--logo-a)]"
      style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace" }}
    >
      {initials}
    </span>
  );
}
