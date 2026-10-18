"use client";

import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/lib/permissions";
import { totals, usePayments } from "./api";
import { PaymentActions } from "./components/payment-actions";
import { PaymentStatusPill } from "./components/payment-status";
import { RequestPayment } from "./components/request-payment";

// Mount on an opportunity page (can request) or a contact page (read and act on existing requests).
export function PaymentsPanel({ opportunityId, contactId }: { opportunityId?: string; contactId?: string }) {
  const me = useMe();
  const payments = usePayments({ opportunityId, contactId }, me.isSuccess && !!(opportunityId || contactId));
  const canEdit = can(me.data, "crm.edit");
  const seeValues = can(me.data, "crm.view_values");
  const rows = payments.data?.items ?? [];
  const t = totals(rows);

  return (
    <Card>
      <CardHeader
        title="Payments"
        description="Collected money and open requests are kept apart."
        actions={opportunityId && canEdit ? <RequestPayment opportunityId={opportunityId} defaultCurrency={me.data?.workspace.defaultCurrency} /> : null}
      />
      <div className="p-5">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-tint-green p-3 text-tint-green-text">
            <p className="text-[12px] font-medium">Collected</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">{payments.data ? <Money cents={t.collected} currency={t.currency} hidden={!seeValues} /> : "–"}</p>
          </div>
          <div className="rounded-lg bg-accent-soft p-3 text-accent-text">
            <p className="text-[12px] font-medium">Awaiting payment</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">{payments.data ? <Money cents={t.outstanding} currency={t.currency} hidden={!seeValues} /> : "–"}</p>
          </div>
        </div>
        {payments.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : payments.isError ? (
          <div className="flex flex-col items-start gap-2">
            <Notice error={payments.error} />
            <Button size="sm" variant="quiet" onClick={() => void payments.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-text-muted">
            <Wallet className="size-4" aria-hidden />
            No payment requests yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 animate-row-in sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  <PaymentStatusPill status={p.status} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold tabular-nums">
                      <Money cents={p.amountCents} currency={p.currency} hidden={!seeValues} />
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
                      <Avatar name={p.requestedByName ?? "System"} size="xs" />
                      {p.requestedByName ?? "System"} · {format(new Date(p.createdAt), "d MMM, HH:mm")}
                    </span>
                  </span>
                </span>
                <PaymentActions payment={p} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
