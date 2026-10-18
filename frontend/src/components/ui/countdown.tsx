"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/cn";

export function Countdown({
  seconds,
  windowSeconds = 90,
}: {
  seconds: number;
  windowSeconds?: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = seconds - elapsed;
  const overdue = remaining < 0;
  const ratio = overdue ? 0 : Math.max(0, Math.min(1, remaining / windowSeconds));
  const urgent = !overdue && ratio < 0.3;
  const label = overdue ? `Overdue +${formatClock(Math.abs(remaining))}` : formatClock(remaining);
  const live = overdue
    ? "Acknowledgement window expired."
    : urgent
      ? "Under 30 percent of the acknowledgement window remains."
      : "";

  return (
    <div className="w-28">
      <p className={cn("font-mono text-[13px] tabular-nums", urgent || overdue ? "text-signal" : "text-ink")}>
        {label}
      </p>
      <div className="mt-1 h-1 overflow-hidden rounded-sm bg-line" aria-hidden>
        <div className={cn("h-full", urgent || overdue ? "bg-signal" : "bg-ink")} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="sr-only" aria-live="polite">
        {live}
      </span>
    </div>
  );
}
