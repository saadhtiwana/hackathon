import { Circle, CircleCheck, CircleDashed, CircleOff, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  ok: { icon: CircleCheck, className: "text-ok" },
  warn: { icon: CircleDashed, className: "text-warn" },
  signal: { icon: CircleOff, className: "text-signal" },
  neutral: { icon: Circle, className: "text-muted" },
  away: { icon: Minus, className: "text-muted" },
} as const;

export function StatusPill({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: string;
}) {
  const { icon: Icon, className } = tones[tone];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 text-[13px]", className)}>
      <Icon className="size-3.5" aria-hidden />
      <span>{children}</span>
    </span>
  );
}
