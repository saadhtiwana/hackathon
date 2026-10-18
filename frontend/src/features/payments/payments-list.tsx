"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CircleCheck, Clock, TrendingUp, Undo2, Wallet } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, type Column } from "@/components/ui/table";
import { isApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { usePaymentSummary, usePayments, type PaymentRow, type PaymentStatus } from "./api";
import { PaymentActions } from "./components/payment-actions";
import { PaymentStatusPill } from "./components/payment-status";

const filters: { value: "all" | PaymentStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "requested", label: "Requested" },
  { value: "paid", label: "Paid" },
  { value: "partially_refunded", label: "Partly refunded" },
  { value: "refunded", label: "Refunded" },
  { value: "expired", label: "Expired" },
  { value: "failed", label: "Failed" },
];

export function PaymentsList() {
  const me = useMe();
  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const payments = usePayments({ status: status === "all" ? undefined : status }, me.isSuccess);
  const seeValues = can(me.data, "crm.view_values");
  const summary = usePaymentSummary(me.isSuccess && seeValues);
  const canEdit = can(me.data, "crm.edit");
  const s = summary.data;
  const money = (c: number | undefined) => (s && c != null ? formatMoney(c, s.currency) : "–");

  const columns: Column<PaymentRow>[] = [
    {
      key: "who",
      header: "Customer",
      sortValue: (p) => p.contactName ?? "",
      render: (p) => (
        <span className="flex min-w-0 items-center gap-2 py-1.5">
          <Avatar name={p.contactName ?? "Customer"} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{p.contactName ?? "Unknown contact"}</span>
            <span className="block truncate text-[12px] text-text-muted">{p.opportunityName ?? ""}</span>
          </span>
        </span>
      ),
    },
    { key: "status", header: "Status", sortValue: (p) => p.status, render: (p) => <PaymentStatusPill status={p.status} /> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (p) => p.amountCents,
      render: (p) => (
        <span className="font-medium tabular-nums">
          <Money cents={p.amountCents} currency={p.currency} hidden={!seeValues} />
          {p.refundedCents > 0 ? <span className="block text-[12px] text-text-muted">refunded {formatMoney(p.refundedCents, p.currency)}</span> : null}
        </span>
      ),
    },
    {
      key: "by",
      header: "Requested by",
      render: (p) => (
        <span className="inline-flex items-center gap-2">
          <Avatar name={p.requestedByName ?? "System"} size="xs" />
          {p.requestedByName ?? "System"}
        </span>
      ),
    },
    { key: "when", header: "Created", sortValue: (p) => p.createdAt, render: (p) => <span className="tabular-nums text-text-muted">{format(new Date(p.createdAt), "d MMM, HH:mm")}</span> },
    { key: "actions", header: "", align: "right", render: (p) => <PaymentActions payment={p} canEdit={canEdit} /> },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money requested and money collected, kept apart. Card details never touch Relay."
        actions={<Select label="Status" value={status} onValueChange={(v) => setStatus(v as "all" | PaymentStatus)} options={filters} />}
      />

      {seeValues ? (
        summary.isError ? (
          <div className="mb-6">
            <Notice error={summary.error} onRetry={() => void summary.refetch()} />
          </div>
        ) : (
          <section className="mb-8" aria-label="Collected versus projected">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Collected" hint="Paid, minus refunds" value={money(s?.collectedCents)} icon={CircleCheck} tint="green" />
              <StatTile label="Awaiting payment" hint="Open payment links" value={money(s?.unpaidRequestedCents)} icon={Clock} tint="violet" />
              <StatTile label="Projected" hint="Open pipeline plus open requests" value={money(s?.projectedCents)} icon={TrendingUp} tint="blue" />
              <StatTile label="Refunded" value={money(s?.refundedCents)} icon={Undo2} tint="pink" />
            </div>
            <p className="mt-2 text-[12px] text-text-muted">Collected is real money received. Awaiting and projected are expectations, never added to collected.</p>
          </section>
        )
      ) : (
        <p className="mb-6 text-[13px] text-text-muted">Totals are hidden. You need the &ldquo;See opportunity values&rdquo; permission to see amounts.</p>
      )}

      {payments.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : payments.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={payments.error} />
          {!isApiError(payments.error) || payments.error.status !== 403 ? (
            <Button size="sm" variant="quiet" onClick={() => void payments.refetch()}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : !payments.data?.items.length ? (
        <EmptyState icon={Wallet} title="No payment requests" body="Request a payment from an opportunity. Paid, refunded and expired links all show here with their Stripe reference." />
      ) : (
        <Table caption="Payments" columns={columns} rows={payments.data.items} rowKey={(p) => p.id} pageSize={15} />
      )}
    </>
  );
}
