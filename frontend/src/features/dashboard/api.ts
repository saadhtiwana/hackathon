"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Availability } from "@/lib/api";

export type Range = "today" | "week" | "month";

export type DashboardData = {
  scope: "me" | "company";
  timezone: string;
  hidden: string[];
  newLeadsToday: number;
  newLeads?: number;
  pipelineValue: { byStage: { stageId: string; stageName: string; valueCents?: number; count: number }[]; totalCents: number | null } | null;
  avgFirstResponse: { seconds: number | null; sample: number; windowDays: number };
  recoveryQueue: number;
  escalations24h: { automatic: number; manualReassignments: number };
  availability: { counts: Record<string, number>; members: { userId: string; name: string; status: Availability; openLeads: number }[] };
  upcomingAppointments: { count: number; items: { id: string; title: string; startsAt: string; timezone: string; userName: string; contactName: string }[] };
  collectedThisMonthCents: number;
  trend?: { date: string; leads: number; acknowledged: number }[];
  paymentsByStatus?: { status: string; count: number; amountCents: number; refundedCents: number }[];
  projectedCents?: number | null;
};

export const WIDGETS = [
  { key: "newLeadsToday", label: "Stat tiles" },
  { key: "availability", label: "Team presence" },
  { key: "myLeads", label: "My leads" },
  { key: "pipelineValue", label: "Pipeline by stage" },
  { key: "leadsTrend", label: "Leads vs acknowledged" },
  { key: "payments", label: "Payments" },
  { key: "upcomingAppointments", label: "Upcoming appointments" },
  { key: "needsAttention", label: "Needs attention" },
] as const;

const fetchDashboard = (range: Range) => apiFetch<DashboardData>(`/dashboard?range=${range}`);

// lead.* and recovery.changed invalidate the "leads" root; payment.updated invalidates "payments"
export function useDashboard(range: Range, enabled = true) {
  return useQuery({ queryKey: ["leads", "dashboard", range], queryFn: () => fetchDashboard(range), enabled, refetchInterval: 30_000 });
}

export function usePaymentFigures(range: Range, enabled = true) {
  return useQuery({ queryKey: ["payments", "dashboard", range], queryFn: () => fetchDashboard(range), enabled, refetchInterval: 30_000 });
}

export function usePrefs() {
  return useQuery({ queryKey: ["dashboard-prefs"], queryFn: () => apiFetch<{ hidden: string[] }>("/dashboard/prefs") });
}

export function useSavePrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hidden: string[]) => apiFetch<{ hidden: string[] }>("/dashboard/prefs", { method: "PUT", body: { hidden } }),
    onMutate: (hidden) => {
      const prev = qc.getQueryData<{ hidden: string[] }>(["dashboard-prefs"]);
      qc.setQueryData(["dashboard-prefs"], { hidden });
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(["dashboard-prefs"], ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["dashboard-prefs"] }),
  });
}
