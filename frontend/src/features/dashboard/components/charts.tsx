"use client";

import { format } from "date-fns";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";
import type { DashboardData } from "../api";

const palette = ["var(--accent)", "var(--status-available)", "var(--status-busy)", "var(--tint-pink-text)", "var(--tint-blue-text)", "var(--status-away)"];
const tooltipStyle = {
  background: "var(--dash-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--text)",
  boxShadow: "var(--dash-shadow)",
};

export function PipelineDonut({ data, currency, canValues }: { data: DashboardData["pipelineValue"]; currency: string; canValues: boolean }) {
  const stages = (data?.byStage ?? []).filter((s) => s.count > 0);
  const total = stages.reduce((n, s) => n + s.count, 0);
  if (!total) return <p className="py-10 text-center text-[13px] text-text-muted">No open opportunities yet.</p>;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={stages} dataKey="count" nameKey="stageName" innerRadius={58} outerRadius={82} paddingAngle={3} cornerRadius={6} stroke="none" isAnimationActive={false}>
              {stages.map((s, i) => (
                <Cell key={s.stageId} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} open`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] font-semibold tabular-nums">{total}</span>
          <span className="text-[11px] text-text-muted">open deals</span>
        </span>
      </div>
      <ul className="mt-4 grid w-full gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
        {stages.map((s, i) => (
          <li key={s.stageId} className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: palette[i % palette.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-text-muted">{s.stageName}</span>
            <span className="font-semibold tabular-nums">{s.count}</span>
            {canValues && s.valueCents != null ? (
              <span className="sr-only">{formatMoney(s.valueCents, currency)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {canValues && data?.totalCents != null ? (
        <p className="mt-3 text-[12px] text-text-muted">
          Open value <span className="font-semibold text-text tabular-nums">{formatMoney(data.totalCents, currency)}</span>
        </p>
      ) : null}
      {!canValues ? <p className="mt-2 text-[11px] text-text-muted">Counts only. Values need the See opportunity values permission.</p> : null}
    </div>
  );
}

export function TrendChart({ trend }: { trend: NonNullable<DashboardData["trend"]> }) {
  if (!trend.length) return <p className="py-10 text-center text-[13px] text-text-muted">No lead activity in this period.</p>;
  const totals = trend.reduce((a, d) => ({ leads: a.leads + d.leads, ack: a.ack + d.acknowledged }), { leads: 0, ack: 0 });
  return (
    <div>
      <p className="mb-2 flex flex-wrap gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-accent" aria-hidden />
          Leads <span className="font-semibold tabular-nums">{totals.leads}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-status-available" aria-hidden />
          Acknowledged <span className="font-semibold tabular-nums">{totals.ack}</span>
        </span>
      </p>
      <div className="h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickFormatter={(d: string) => format(new Date(`${d}T00:00:00`), trend.length > 10 ? "d MMM" : "EEE")}
              minTickGap={12}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={40} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => format(new Date(`${d}T00:00:00`), "EEE d MMM")} />
            <Line type="monotone" dataKey="leads" name="Leads" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="acknowledged" name="Acknowledged" stroke="var(--status-available)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        {trend.map((d) => `${d.date}: ${d.leads} leads, ${d.acknowledged} acknowledged`).join("; ")}
      </p>
    </div>
  );
}
