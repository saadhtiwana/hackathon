"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { apiFetch } from "@/lib/api/client";

export type CalendarUser = {
  userId: string;
  name: string;
  status: "connected" | "not_connected" | "needs_reconnect";
  account: string | null;
  bookable: boolean;
  reason: string | null;
};

export type Appointment = {
  id: string;
  userId: string;
  userName: string;
  contactId: string;
  contactName: string;
  opportunityId: string | null;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "scheduled" | "cancelled" | "completed";
};

export type Busy = { start: string; end: string };

// "appointments" is invalidated by the realtime hook on appointment.updated
export const apptKeys = {
  all: ["appointments"] as const,
  list: (f: Record<string, string | undefined>) => ["appointments", "list", f] as const,
  users: ["appointments", "calendar-users"] as const,
  busy: (userId: string, day: string, tz: string) => ["appointments", "busy", userId, day, tz] as const,
};

export function useWorkspaceTimezone() {
  const q = useQuery({
    queryKey: ["workspace"],
    queryFn: () => apiFetch<{ workspace: { timezone?: string } }>("/workspace"),
    staleTime: 5 * 60_000,
  });
  return q.data?.workspace.timezone || "Asia/Karachi";
}

export function useCalendarUsers(enabled = true) {
  return useQuery({
    queryKey: apptKeys.users,
    queryFn: () => apiFetch<{ items: CalendarUser[] }>("/integrations/google/users"),
    enabled,
  });
}

export function dayRange(day: string, tz: string) {
  const from = fromZonedTime(`${day}T00:00:00`, tz);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export const zonedToUtc = (day: string, time: string, tz: string) => fromZonedTime(`${day}T${time}:00`, tz);
export const fmt = (iso: string | Date, tz: string, pattern: string) => formatInTimeZone(iso, tz, pattern);

export function useBusy(userId: string | null, day: string, tz: string) {
  return useQuery({
    queryKey: apptKeys.busy(userId ?? "", day, tz),
    queryFn: () => {
      const r = dayRange(day, tz);
      return apiFetch<{ busy: Busy[] }>(`/users/${userId}/busy?from=${r.from.toISOString()}&to=${r.to.toISOString()}`);
    },
    enabled: !!userId && !!day,
    retry: false,
  });
}

export function useAppointments(f: { userId?: string; contactId?: string; opportunityId?: string }, enabled = true) {
  return useQuery({
    queryKey: apptKeys.list(f),
    queryFn: () => {
      const q = new URLSearchParams({ limit: "200" });
      for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
      return apiFetch<{ items: Appointment[] }>(`/appointments?${q}`);
    },
    enabled,
    refetchInterval: 60_000,
  });
}

export type CreateInput = {
  userId: string;
  contactId: string;
  opportunityId?: string;
  start: string;
  end: string;
  timeZone: string;
  title: string;
  notes?: string;
  force?: boolean;
};

function useApptMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: apptKeys.all }) });
}

export const useCreateAppointment = () =>
  useApptMutation((body: CreateInput) => apiFetch<{ appointment: Appointment & { calendarLink?: string } }>("/appointments", { method: "POST", body }));
export const useUpdateAppointment = () =>
  useApptMutation((a: { id: string; start: string; end: string; timeZone: string; force?: boolean }) => {
    const { id, ...body } = a;
    return apiFetch<{ appointment: Appointment }>(`/appointments/${id}`, { method: "PATCH", body });
  });
export const useCancelAppointment = () =>
  useApptMutation((id: string) => apiFetch<{ appointment: Appointment }>(`/appointments/${id}`, { method: "DELETE" }));

export function useContactSearch(q: string) {
  return useQuery({
    queryKey: ["contacts", "search", q],
    queryFn: () => apiFetch<{ items: { id: string; name: string; email?: string | null }[] }>(`/contacts?limit=20${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    staleTime: 10_000,
  });
}
