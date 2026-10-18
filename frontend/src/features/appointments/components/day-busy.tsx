"use client";

import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { dayRange, fmt, useBusy } from "../api";

const START_H = 7;
const END_H = 21;

// Busy blocks for one day on a 07:00-21:00 bar, plus a readable list (colour is not the only signal).
export function DayBusy({ userId, day, tz, name }: { userId: string; day: string; tz: string; name: string }) {
  const busy = useBusy(userId, day, tz);
  if (busy.isLoading) return <Skeleton className="h-14 w-full" />;
  if (busy.isError) return <Notice error={busy.error} onRetry={() => void busy.refetch()} />;
  const r = dayRange(day, tz);
  const span = (END_H - START_H) * 3600_000;
  const origin = r.from.getTime() + START_H * 3600_000;
  const items = busy.data?.busy ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-7 overflow-hidden rounded-md bg-tint-green" aria-hidden>
        {items.map((b) => {
          const s = Math.max(0, (new Date(b.start).getTime() - origin) / span);
          const e = Math.min(1, (new Date(b.end).getTime() - origin) / span);
          if (e <= 0 || s >= 1) return null;
          return <span key={b.start} className="absolute inset-y-0 bg-[color-mix(in_srgb,var(--status-busy)_55%,transparent)]" style={{ left: `${s * 100}%`, width: `${(e - s) * 100}%` }} />;
        })}
      </div>
      <div className="flex justify-between text-[11px] text-text-muted tabular-nums" aria-hidden>
        <span>07:00</span>
        <span>14:00</span>
        <span>21:00</span>
      </div>
      <p className="text-[13px]">
        {items.length === 0 ? (
          <span className="text-ok">{name} is free all day.</span>
        ) : (
          <>
            <span className="font-medium">{name} is busy: </span>
            {items.map((b) => `${fmt(b.start, tz, "HH:mm")}–${fmt(b.end, tz, "HH:mm")}`).join(", ")}
          </>
        )}
      </p>
    </div>
  );
}
