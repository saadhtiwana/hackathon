"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Availability, List } from "@/lib/api";
import { learnServerClock } from "./time";

export type LeadStatus = "unassigned" | "assigned" | "acknowledged" | "closed";
export type LeadSource = "webform" | "whatsapp" | "manual" | "discord";
export type SkipReason = "on_leave" | "offline" | "busy" | "at_capacity" | "excluded";
export type AssignmentReason = "initial" | "ack_expired" | "manual" | "owner_unavailable";
export type RecoveryCode = "unacked_overdue" | "escalated_multiple" | "idle";
export type EscalationKind = "next_eligible" | "backup" | "manager";

export type Lead = {
  id: string;
  contactId: string;
  contactName?: string;
  opportunityId: string | null;
  source: LeadSource;
  status: LeadStatus;
  ownerId: string | null;
  assignedAt: string | null;
  ackDeadline: string | null;
  ackRemainingSeconds: number | null;
  acknowledgedAt: string | null;
  firstAssignedAt: string | null;
  firstAcknowledgedAt: string | null;
  escalationLevel: number;
  escalationCount: number;
  lastActionAt: string;
  ownerAway: boolean;
  version: number;
  closedAt: string | null;
  createdAt: string;
};

export type Assignment = {
  id: string;
  userId: string;
  userName: string;
  assignedAt: string;
  endedAt: string | null;
  reason: AssignmentReason;
  endReason: string | null;
  level: number;
  skipped: { userId: string; reason: SkipReason }[];
};

export type RecoveryReason = { code: RecoveryCode; text: string };

export type LeadDetail = {
  lead: Lead;
  contact: { id: string; name: string; phone: string | null; email: string | null } | null;
  assignments: Assignment[];
  ackRemainingSeconds: number | null;
  recoveryReasons: RecoveryReason[];
};

export type EscalationLevel = { kind: EscalationKind; userId?: string; seconds: number };

export type AssignmentRules = {
  strategy: "round_robin";
  ackWindowSeconds: number;
  maxOpenLeads: number;
  idleSeconds: number;
  escalationLevels: EscalationLevel[];
  acknowledgedOnLeavePolicy: "keep_flag_recover";
};

export type Member = { userId: string; name: string; status: Availability; openLeads: number };

export type LeadFilters = { status?: LeadStatus; mine?: boolean };

export const leadKeys = {
  all: ["leads"] as const,
  list: (f: LeadFilters) => ["leads", "list", f] as const,
  detail: (id: string) => ["leads", "detail", id] as const,
  recovery: ["leads", "recovery"] as const,
  // own root so lead events do not reset the rules form while someone edits it
  rules: ["assignment-rules"] as const,
  members: ["availability", "lead-members"] as const,
};

// Realtime covers most changes; this catches events the stream does not map yet.
const FALLBACK_REFETCH_MS = 20_000;

function syncClock(leads: Lead[]) {
  for (const l of leads) {
    if (l.ackDeadline && l.ackRemainingSeconds != null) learnServerClock(l.ackDeadline, l.ackRemainingSeconds);
  }
}

export const leadsApi = {
  list: async (f: LeadFilters) => {
    const q = new URLSearchParams({ limit: "200" });
    if (f.status) q.set("status", f.status);
    if (f.mine) q.set("mine", "true");
    const res = await apiFetch<List<Lead>>(`/leads?${q}`);
    syncClock(res.items);
    return res;
  },
  get: async (id: string) => {
    const res = await apiFetch<LeadDetail>(`/leads/${id}`);
    syncClock([res.lead]);
    return res;
  },
  acknowledge: (id: string) => apiFetch<{ lead: Lead }>(`/leads/${id}/acknowledge`, { method: "POST" }),
  reassign: (id: string, body: { toUserId: string; version: number }) =>
    apiFetch<{ lead: Lead }>(`/leads/${id}/reassign`, { method: "POST", body }),
  close: (id: string, outcome?: string) =>
    apiFetch<{ lead: Lead }>(`/leads/${id}/close`, { method: "POST", body: outcome ? { outcome } : {} }),
  recovery: async () => {
    const res = await apiFetch<List<{ lead: Lead; reasons: RecoveryReason[] }>>("/leads/recovery?limit=200");
    syncClock(res.items.map((i) => i.lead));
    return res;
  },
  rules: () => apiFetch<AssignmentRules>("/assignment-rules"),
  saveRules: (rules: AssignmentRules) => apiFetch<AssignmentRules>("/assignment-rules", { method: "PUT", body: rules }),
  members: () => apiFetch<List<Member>>("/availability"),
  publicForm: (slug: string) =>
    apiFetch<{ workspaceName: string; fields: { key: string; label: string; type: string; required: boolean }[] }>(
      `/public/forms/${encodeURIComponent(slug)}`,
    ),
  submitPublic: (slug: string, body: { name: string; phone?: string; email?: string; message?: string; website?: string }) =>
    apiFetch<{ ok: true }>(`/public/leads/${encodeURIComponent(slug)}`, { method: "POST", body }),
};

export function useLeads(f: LeadFilters, enabled = true) {
  return useQuery({
    queryKey: leadKeys.list(f),
    queryFn: () => leadsApi.list(f),
    enabled,
    refetchInterval: FALLBACK_REFETCH_MS,
  });
}

export function useLead(id: string) {
  return useQuery({ queryKey: leadKeys.detail(id), queryFn: () => leadsApi.get(id), refetchInterval: FALLBACK_REFETCH_MS });
}

export function useRecovery(enabled = true) {
  return useQuery({ queryKey: leadKeys.recovery, queryFn: leadsApi.recovery, enabled, refetchInterval: FALLBACK_REFETCH_MS });
}

export function useRules(enabled = true) {
  return useQuery({ queryKey: leadKeys.rules, queryFn: leadsApi.rules, enabled, refetchOnWindowFocus: false });
}

export function useMembers() {
  return useQuery({ queryKey: leadKeys.members, queryFn: leadsApi.members, staleTime: 10_000 });
}

export function useMemberNames() {
  const members = useMembers();
  const names = new Map((members.data?.items ?? []).map((m) => [m.userId, m.name]));
  return (id: string | null | undefined) => (id ? (names.get(id) ?? "Former member") : "Nobody");
}

function useLeadMutation<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export const useAcknowledge = () => useLeadMutation((id: string) => leadsApi.acknowledge(id));
export const useReassign = () =>
  useLeadMutation((a: { id: string; toUserId: string; version: number }) => leadsApi.reassign(a.id, a));
export const useCloseLead = () => useLeadMutation((a: { id: string; outcome?: string }) => leadsApi.close(a.id, a.outcome));
