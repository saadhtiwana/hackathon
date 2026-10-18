import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardData, Range } from "../api";

const rangeWord: Record<Range, string> = { today: "today", week: "this week", month: "this month" };

function clock(seconds: number | null) {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function Tile({ href, value, label, hint }: { href: string; value: React.ReactNode; label: string; hint?: string }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-1 p-4 hover:bg-surface-hover sm:p-5">
      <span className="text-[13px] text-text-muted">{label}</span>
      <span className="min-w-0 truncate text-[28px] leading-tight font-semibold tracking-[-0.02em] tabular-nums sm:text-[32px]">{value}</span>
      {hint ? <span className="text-[12px] leading-snug text-text-muted">{hint}</span> : null}
    </Link>
  );
}

export function StatRow({ data, range, loading }: { data?: DashboardData; range: Range; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[112px] w-full rounded-none" />
        ))}
      </div>
    );
  }
  const n = (v: number | undefined) => (data ? (v ?? 0) : "–");
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border xl:grid-cols-4 [&>a]:bg-[var(--dash-card)]">
      <Tile href={`/leads?created=${range}`} value={n(data?.newLeads ?? data?.newLeadsToday)} label={`New leads ${rangeWord[range]}`} />
      <Tile
        href="/leads?status=acknowledged"
        value={data ? clock(data.avgFirstResponse.seconds) : "–"}
        label="Avg first response"
        hint={data?.avgFirstResponse.sample ? `mm:ss over ${data.avgFirstResponse.sample} leads, ${data.avgFirstResponse.windowDays} days` : "No acknowledged leads yet"}
      />
      <Tile href="/recovery" value={n(data?.recoveryQueue)} label="In recovery" hint="Overdue, escalated twice or idle" />
      <Tile
        href="/leads?escalated=24h"
        value={n(data?.escalations24h.automatic)}
        label="Escalations 24h"
        hint={data ? `${data.escalations24h.manualReassignments} manual reassignments, counted apart` : undefined}
      />
    </div>
  );
}
