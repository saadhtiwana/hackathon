"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type PaymentStatus = "requested" | "paid" | "expired" | "failed" | "refunded" | "partially_refunded";

export type PaymentRow = {
  id: string;
  status: PaymentStatus;
  amountCents: number;
  refundedCents: number;
  currency: string;
  url: string | null;
  failureReason: string | null;
  opportunityName: string | null;
  contactName: string | null;
  requestedByName: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type PaymentDetail = {
  payment: PaymentRow & { description?: string | null };
  providerRef: { provider: string; sessionId: string | null; paymentIntentId: string | null } | null;
  requestedBy: { id: string; name: string } | null;
};

export type PaymentSummary = {
  currency: string;
  collectedCents: number;
  refundedCents: number;
  openPipelineCents: number;
  unpaidRequestedCents: number;
  projectedCents: number;
};

export type PaymentFilter = { status?: PaymentStatus; opportunityId?: string; contactId?: string };

// "payments" is the root the realtime hook invalidates on payment.updated
export const paymentKeys = {
  all: ["payments"] as const,
  list: (f: PaymentFilter) => ["payments", "list", f] as const,
  detail: (id: string) => ["payments", "detail", id] as const,
  summary: ["payments", "summary"] as const,
};

export const paymentsApi = {
  list: (f: PaymentFilter) => {
    const q = new URLSearchParams({ limit: "200" });
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    return apiFetch<{ items: PaymentRow[]; nextCursor: string | null; total?: number }>(`/payments?${q}`);
  },
  get: (id: string) => apiFetch<PaymentDetail>(`/payments/${id}`),
  summary: () => apiFetch<PaymentSummary>("/payments/summary"),
  create: (opportunityId: string, body: { amount: number; currency: string; description?: string }) =>
    apiFetch<{ payment: PaymentRow }>(`/opportunities/${opportunityId}/payments`, { method: "POST", body }),
  expire: (id: string) => apiFetch<{ payment: PaymentRow }>(`/payments/${id}/expire`, { method: "POST" }),
  send: (id: string) => apiFetch<{ message: unknown }>(`/payments/${id}/send`, { method: "POST" }),
};

export function usePayments(f: PaymentFilter, enabled = true) {
  return useQuery({ queryKey: paymentKeys.list(f), queryFn: () => paymentsApi.list(f), enabled, refetchInterval: 30_000 });
}

export function usePaymentDetail(id: string, enabled: boolean) {
  return useQuery({ queryKey: paymentKeys.detail(id), queryFn: () => paymentsApi.get(id), enabled });
}

export function usePaymentSummary(enabled = true) {
  return useQuery({ queryKey: paymentKeys.summary, queryFn: paymentsApi.summary, enabled, retry: false });
}

function usePaymentMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: paymentKeys.all }) });
}

export const useCreatePayment = () =>
  usePaymentMutation((a: { opportunityId: string; amount: number; currency: string; description?: string }) =>
    paymentsApi.create(a.opportunityId, a),
  );
export const useExpirePayment = () => usePaymentMutation((id: string) => paymentsApi.expire(id));
export const useSendPayment = () => usePaymentMutation((id: string) => paymentsApi.send(id));

// collected = paid minus refunds; outstanding = open requests still awaiting payment
export function totals(rows: PaymentRow[]) {
  let collected = 0;
  let outstanding = 0;
  for (const p of rows) {
    if (p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded") collected += p.amountCents - p.refundedCents;
    if (p.status === "requested") outstanding += p.amountCents;
  }
  return { collected, outstanding, currency: rows[0]?.currency ?? "PKR" };
}
