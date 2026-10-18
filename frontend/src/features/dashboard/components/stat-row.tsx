import Link from "next/link";
import { AlarmClock, LifeBuoy, Repeat, UserPlus, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { DashboardData, Range } from "../api";

const rangeWord: Record<Range, string> = { today: "today", week: "this week", month: "this month" };

function clock(seconds: number | null) {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function Tile({ href, value, label, hint, icon: Icon, tint }: { href: string; value: React.ReactNode; label: string; hint?: string; icon: LucideIcon; tint: string }) {
  return (
    <Link href={href} className={cn("group flex min-w-0 flex-col rounded-[20px] p-4 sm:p-5 hover:-translate-y-0.5 hover:shadow-[var(--dash-shadow)]", tint)}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[28px] leading-none font-semibold tracking-tight tabular-nums sm:text-[36px]">{value}</span>
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 sm:size-11 dark:bg-black/20" aria-hidden>
          <Icon className="size-5" />
        </span>
      </span>
      <span className="mt-4 text-[14px] font-medium">{label}</span>
      {hint ? <span className="mt-0.5 text-[12px] opacity-75">{hint}</span> : null}
    </Link>
  );
}

export function StatRow({ data, range, loading }: { data?: DashboardData; range: Range; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[132px] w-full rounded-[20px]" />
        ))}
      </div>
    );
  }
  const n = (v: number | undefined) => (data ? (v ?? 0) : "–");
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Tile href={`/leads?created=${range}`} value={n(data?.newLeads ?? data?.newLeadsToday)} label={`New leads ${rangeWord[range]}`} icon={UserPlus} tint="bg-tint-blue text-tint-blue-text" />
      <Tile
        href="/leads?status=acknowledged"
        value={data ? clock(data.avgFirstResponse.seconds) : "–"}
        label="Avg first response"
        hint={data?.avgFirstResponse.sample ? `mm:ss over ${data.avgFirstResponse.sample} leads, ${data.avgFirstResponse.windowDays} days` : "No acknowledged leads yet"}
        icon={AlarmClock}
        tint="bg-tint-violet text-tint-violet-text"
      />
      <Tile href="/recovery" value={n(data?.recoveryQueue)} label="In recovery" hint="Overdue, escalated twice or idle" icon={LifeBuoy} tint="bg-tint-pink text-tint-pink-text" />
      <Tile
        href="/leads?escalated=24h"
        value={n(data?.escalations24h.automatic)}
        label="Escalations 24h"
        hint={data ? `${data.escalations24h.manualReassignments} manual reassignments, counted apart` : undefined}
        icon={Repeat}
        tint="bg-tint-yellow text-tint-yellow-text"
      />
    </div>
  );
}
