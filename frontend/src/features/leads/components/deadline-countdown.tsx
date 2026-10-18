"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";
import { secondsBetween, useServerNow } from "../time";

// Same look as components/ui/countdown, but driven by the deadline itself so it stays exact
// across re-renders, refetches and background tabs.
export function DeadlineCountdown({
  deadline,
  startedAt,
  className,
}: {
  deadline: string;
  startedAt?: string | null;
  className?: string;
}) {
  const now = useServerNow();
  if (!now) return <span className="inline-block h-6 w-16" aria-hidden />;

  const remaining = secondsBetween(now, deadline);
  const windowSeconds = startedAt ? Math.max(1, secondsBetween(new Date(startedAt).getTime(), deadline)) : 300;
  const overdue = remaining < 0;
  const ratio = overdue ? 0 : Math.min(1, remaining / windowSeconds);
  const urgent = !overdue && ratio < 0.3;
  const label = overdue ? `Overdue +${formatClock(-remaining)}` : formatClock(remaining);

  return (
    <span
      className={cn(
        "relative inline-flex h-6 items-center gap-1.5 overflow-hidden rounded-md px-2 font-mono text-[12px] font-medium whitespace-nowrap tabular-nums",
        overdue || urgent
          ? "bg-[color-mix(in_srgb,var(--signal)_12%,transparent)] text-signal"
          : "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok",
        className,
      )}
      title={overdue ? "Acknowledgement window expired" : "Time left to acknowledge"}
    >
      <Clock className="size-3" aria-hidden />
      <span>{label}</span>
      {/* draining bar: the share of the window that is left */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 bg-current opacity-40 transition-[width] duration-1000 ease-linear"
        style={{ width: `${ratio * 100}%` }}
      />
      <span className="sr-only">{overdue ? "Acknowledgement window expired." : urgent ? "Less than 30 percent of the window left." : ""}</span>
    </span>
  );
}
