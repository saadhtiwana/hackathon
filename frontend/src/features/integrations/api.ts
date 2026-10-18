"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type ProviderId = "stripe" | "email" | "google_calendar" | "email_alerts";

export type Integration = {
  provider: ProviderId | string;
  label: string;
  perUser: boolean;
  status: "connected" | "error" | "not_connected";
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  secretMasked: string | null;
  recentErrors: { type: string; message: string; at: string }[];
  limits: { summary: string; can: string[]; cannot: string[] };
  connectedUsers?: number;
  needsReconnect?: number;
  configured?: boolean;
};

export type SyncEvent = {
  id: string;
  direction: "in" | "out";
  provider: string;
  type: string;
  externalId: string | null;
  result: string;
  httpStatus: number | null;
  error: string | null;
  ref: string | null;
  createdAt: string;
};

export type Alert = {
  id: string;
  source: "queue" | "delivery";
  kind: string;
  status: "failed" | "retrying" | "delivered" | "not_delivered";
  toUserId: string | null;
  toUserName: string | null;
  leadId: string | null;
  attempts: number | null;
  maxAttempts: number | null;
  error: string | null;
  at: string;
};

export type CalendarMember = { userId: string; name: string; status: "connected" | "not_connected" | "needs_reconnect"; account: string | null; reason: string | null };

export const intKeys = {
  all: ["integrations"] as const,
  list: ["integrations", "list"] as const,
  events: (p: string) => ["integrations", "events", p] as const,
  alerts: ["integrations", "alerts"] as const,
  people: ["integrations", "calendar-people"] as const,
};

export function useIntegrations(enabled = true) {
  return useQuery({ queryKey: intKeys.list, queryFn: () => apiFetch<{ items: Integration[] }>("/integrations"), enabled, refetchInterval: 30_000 });
}

export function useSyncHistory(provider: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: intKeys.events(provider),
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: SyncEvent[]; nextCursor: string | null }>(`/integrations/${provider}/events?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useAlerts(enabled: boolean) {
  return useQuery({ queryKey: intKeys.alerts, queryFn: () => apiFetch<{ items: Alert[] }>("/integrations/email/alerts"), enabled, refetchInterval: 30_000 });
}

export function useCalendarPeople(enabled = true) {
  return useQuery({ queryKey: intKeys.people, queryFn: () => apiFetch<{ items: CalendarMember[] }>("/integrations/google/users"), enabled });
}

function useIntMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: intKeys.all }) });
}

export const useConnect = () =>
  useIntMutation((a: { provider: string; body?: Record<string, unknown> }) =>
    apiFetch<{ authUrl?: string }>(`/integrations/${a.provider}/connect`, { method: "POST", body: a.body ?? {} }),
  );
export const useTest = () => useIntMutation((provider: string) => apiFetch<{ ok: boolean; message?: string }>(`/integrations/${provider}/test`, { method: "POST" }));
export const useDisconnect = () => useIntMutation((provider: string) => apiFetch<void>(`/integrations/${provider}`, { method: "DELETE" }));
export const useConnectLink = () =>
  useMutation({
    mutationFn: (a: { userId: string; purpose: "calendar" | "mailbox" }) =>
      apiFetch<{ url: string; expiresAt: string }>("/integrations/google/connect-link", { method: "POST", body: a }),
  });
