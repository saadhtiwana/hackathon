"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Availability } from "@/lib/api";

export type BaseLevel = "owner" | "admin" | "user";
export type Member = {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  baseLevel: BaseLevel;
  availability: Availability;
  active: boolean;
};
export type Role = { id: string; name: string; baseLevel: BaseLevel; permissions: string[] };
export type Permission = { key: string; label: string; group: string };
export type Invite = { id: string; email: string; roleId: string; expiresAt: string };
export type CalendarState = { userId: string; status: "connected" | "not_connected" | "needs_reconnect"; reason: string | null };

// members live under "availability" so availability.changed refreshes them
export const teamKeys = {
  members: ["availability", "team-members"] as const,
  roles: ["team", "roles"] as const,
  permissions: ["team", "permissions"] as const,
  invites: ["team", "invites"] as const,
  calendars: ["appointments", "calendar-users"] as const,
};

export const useMembers = (enabled = true) =>
  useQuery({ queryKey: teamKeys.members, queryFn: () => apiFetch<{ items: Member[] }>("/users"), enabled, refetchInterval: 30_000 });
export const useRoles = (enabled = true) => useQuery({ queryKey: teamKeys.roles, queryFn: () => apiFetch<{ items: Role[] }>("/roles"), enabled });
export const usePermissions = (enabled = true) =>
  useQuery({ queryKey: teamKeys.permissions, queryFn: () => apiFetch<{ items: Permission[] }>("/permissions"), enabled, staleTime: 5 * 60_000 });
export const useInvites = (enabled = true) => useQuery({ queryKey: teamKeys.invites, queryFn: () => apiFetch<{ items: Invite[] }>("/users/invites"), enabled });
export const useCalendars = (enabled = true) =>
  useQuery({ queryKey: teamKeys.calendars, queryFn: () => apiFetch<{ items: CalendarState[] }>("/integrations/google/users"), enabled, retry: false });

function useTeamMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["team"] });
      await qc.invalidateQueries({ queryKey: teamKeys.members });
    },
  });
}

export const useUpdateMember = () =>
  useTeamMutation((a: { id: string; roleId?: string; active?: boolean }) => {
    const { id, ...body } = a;
    return apiFetch<{ user: unknown }>(`/users/${id}`, { method: "PATCH", body });
  });
export const useInvite = () =>
  useTeamMutation((body: { email: string; roleId: string }) =>
    apiFetch<{ id: string; email: string; inviteUrl: string; expiresAt: string }>("/users/invites", { method: "POST", body }),
  );
export const useRevokeInvite = () => useTeamMutation((id: string) => apiFetch<void>(`/users/invites/${id}`, { method: "DELETE" }));
export const useSaveRole = () =>
  useTeamMutation((a: { id: string; permissions: string[] }) => apiFetch<{ role: Role }>(`/roles/${a.id}`, { method: "PATCH", body: { permissions: a.permissions } }));

export const levelLabel: Record<BaseLevel, string> = { owner: "Owner", admin: "Admin", user: "User" };

// Mirrors the server rules so the page can say why before anyone clicks.
export function editBlock(actor: BaseLevel, target: BaseLevel): string | null {
  if (target === "owner") return actor === "owner" ? "The Owner role cannot be changed; ownership transfer is not supported." : "Only the Owner can modify the Owner.";
  if (target === "admin" && actor !== "owner") return "Only the Owner can change an admin.";
  return null;
}
