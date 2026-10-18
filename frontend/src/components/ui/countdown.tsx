"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useServerNow } from "@/lib/clock";
import { formatClock } from "@/lib/format";

type Reading = { remaining: number; ratio: number; overdue: boolean; urgent: boolean; ready: boolean };

function read(remaining: number, windowSeconds: number, ready = true): Reading {
  const overdue = remaining < 0;
  const ratio = overdue ? 0 : Math.max(0, Math.min(1, remaining / Math.max(1, windowSeconds)));
  return { remaining, ratio, overdue, urgent: !overdue && ratio < 0.3, ready };
}

// Absolute deadline: recomputed from the clock on every tick, so it never drifts in background tabs
// and re-renders cannot double-count.
function useDeadline(deadline: string, startedAt: string | null | undefined, windowSeconds: number | undefined): Reading {
  const now = useServerNow();
  const end = new Date(deadline).getTime();
  const total = windowSeconds ?? (startedAt ? Math.round((end - new Date(startedAt).getTime()) / 1000) : 300);
  return read(Math.round((end - now) / 1000), total, now > 0);
}

// Original relative mode: counts down from `seconds` given at mount.
function useElapsed(seconds: number, windowSeconds: number): Reading {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return read(seconds - elapsed, windowSeconds);
}

function liveText(r: Reading) {
  return r.overdue ? "Acknowledgement window expired." : r.urgent ? "Under 30 percent of the acknowledgement window remains." : "";
}

type CountdownProps =
  | { seconds: number; windowSeconds?: number; deadline?: undefined; startedAt?: undefined; className?: string }
  | { deadline: string; startedAt?: string | null; windowSeconds?: number; seconds?: undefined; className?: string };

export function Countdown(props: CountdownProps) {
  return props.deadline !== undefined ? (
    <DeadlinePill {...props} />
  ) : (
    <ElapsedPill seconds={props.seconds} windowSeconds={props.windowSeconds ?? 90} className={props.className} />
  );
}

function DeadlinePill({ deadline, startedAt, windowSeconds, className }: { deadline: string; startedAt?: string | null; windowSeconds?: number; className?: string }) {
  return <Pill r={useDeadline(deadline, startedAt, windowSeconds)} className={className} />;
}

function ElapsedPill({ seconds, windowSeconds, className }: { seconds: number; windowSeconds: number; className?: string }) {
  return <Pill r={useElapsed(seconds, windowSeconds)} className={className} />;
}

function Pill({ r, className }: { r: Reading; className?: string }) {
  if (!r.ready) return <span className={cn("inline-block h-6 w-16 rounded-full bg-surface-muted", className)} aria-hidden />;
  const label = r.overdue ? `Overdue +${formatClock(-r.remaining)}` : formatClock(r.remaining);
  return (
    <span
      className={cn(
        "relative inline-flex h-6 items-center gap-1.5 overflow-hidden rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap tabular-nums",
        r.overdue || r.urgent
          ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger"
          : "bg-tint-green text-tint-green-text",
        className,
      )}
    >
      <Clock className="size-3" aria-hidden />
      {label}
      <span aria-hidden className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30 transition-[width] duration-1000 ease-linear" style={{ width: `${r.ratio * 100}%` }} />
      <span className="sr-only" aria-live="polite">
        {liveText(r)}
      </span>
    </span>
  );
}

const two = (n: number) => n.toString().padStart(2, "0");

// Large, calm timer for a single lead: accent normally, danger only under 30% or once overdue.
export function BigTimer({
  deadline,
  startedAt,
  windowSeconds,
  caption = "left to acknowledge",
  className,
}: {
  deadline: string;
  startedAt?: string | null;
  windowSeconds?: number;
  caption?: string;
  className?: string;
}) {
  const r = useDeadline(deadline, startedAt, windowSeconds);
  const abs = Math.abs(r.remaining);
  const text = `${r.overdue ? "+" : ""}${two(Math.floor(abs / 60))}:${two(abs % 60)}`;
  const hot = r.overdue || r.urgent;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        className={cn("text-[44px] leading-none font-semibold tracking-tight tabular-nums", hot ? "text-danger" : "text-accent-text")}
        aria-hidden={!r.ready}
      >
        {r.ready ? text : "--:--"}
      </span>
      <span className="text-[13px] text-text-muted">{r.overdue ? "overdue, escalating" : caption}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <span
          className={cn("block h-full rounded-full transition-[width] duration-1000 ease-linear", hot ? "bg-danger" : "bg-accent")}
          style={{ width: `${r.ratio * 100}%` }}
        />
      </span>
      <span className="sr-only" aria-live="polite">
        {r.ready ? liveText(r) : ""}
      </span>
    </div>
  );
}
