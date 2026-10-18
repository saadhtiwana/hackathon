"use client";

import { useMe } from "@/components/session";
import { formatMoney } from "@/lib/format";
import { bigMoney } from "./money";
import { can } from "@/lib/permissions";
import { usePaymentFigures, type Range } from "../api";
import { CardState, DashCard } from "./dash-card";

const rows = [
  { key: "paid", label: "Paid", bar: "bg-status-available" },
  { key: "requested", label: "Requested", bar: "bg-accent" },
  { key: "expired", label: "Expired", bar: "bg-status-away" },
  { key: "failed", label: "Failed", bar: "bg-danger" },
  { key: "refunded", label: "Refunded", bar: "bg-tint-pink-text" },
] as const;

export function PaymentsCard({ range }: { range: Range }) {
  const me = useMe();
  const figures = usePaymentFigures(range, me.isSuccess);
  const seeValues = can(me.data, "crm.view_values");
  const currency = me.data?.workspace.defaultCurrency ?? "PKR";
  const d = figures.data;
  const by = (k: string) => {
    const list = d?.paymentsByStatus ?? [];
    const pick = list.filter((p) => p.status === k || (k === "refunded" && p.status === "partially_refunded"));
    return { count: pick.reduce((n, p) => n + p.count, 0), amount: pick.reduce((n, p) => n + (k === "refunded" ? p.refundedCents : p.amountCents), 0) };
  };
  const values = rows.map((r) => ({ ...r, ...by(r.key) }));
  const max = Math.max(1, ...values.map((v) => v.count));
  const money = (c: number | null | undefined) => (c == null ? "–" : seeValues ? formatMoney(c, currency) : "••••");
  const big = (c: number | null | undefined) => {
    if (c == null) return <span>–</span>;
    if (!seeValues) return <span>••••</span>;
    const m = bigMoney(c, currency);
    return (
      <span title={m.exact} aria-label={m.exact}>
        {m.text}
      </span>
    );
  };

  return (
    <DashCard title="Payments" href="/payments">
      <CardState query={figures} height="h-64">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="min-w-0 rounded-2xl bg-tint-green p-4 text-tint-green-text">
            <p className="text-[12px] font-medium">Collected this month</p>
            <p className="mt-1 truncate text-[22px] leading-tight font-semibold tracking-tight tabular-nums sm:text-[28px]">{big(d?.collectedThisMonthCents ?? 0)}</p>
            <p className="text-[11px] opacity-80">Paid and confirmed, minus refunds</p>
          </div>
          <div className="min-w-0 rounded-2xl bg-accent-soft p-4 text-accent-text">
            <p className="text-[12px] font-medium">Projected</p>
            <p className="mt-1 truncate text-[22px] leading-tight font-semibold tracking-tight tabular-nums sm:text-[28px]">{big(d?.projectedCents)}</p>
            <p className="text-[11px] opacity-80">{d?.projectedCents == null ? "Company view with values only" : "Open pipeline plus open requests"}</p>
          </div>
        </div>
        {!d?.paymentsByStatus ? (
          <p className="text-[13px] text-text-muted">Per-status totals appear once the server is updated.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {values.map((v) => (
              <li key={v.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium">{v.label}</span>
                  <span className="text-text-muted tabular-nums">
                    {v.count} <span aria-hidden>|</span> {money(v.amount)}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--dash-track)]" aria-hidden>
                  <div className={`h-full rounded-full ${v.bar}`} style={{ width: `${v.count ? Math.max(6, (v.count / max) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardState>
    </DashCard>
  );
}
