"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type AuditEntry = {
  id: string;
  actor: { id: string; name: string | null } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type AuditFilters = { action?: string; actorId?: string; from?: string; to?: string };

const qs = (f: AuditFilters, cursor?: string) => {
  const p = new URLSearchParams({ limit: "50" });
  if (f.action) p.set("action", f.action);
  if (f.actorId) p.set("actorId", f.actorId);
  if (f.from) p.set("from", new Date(`${f.from}T00:00:00`).toISOString());
  if (f.to) p.set("to", new Date(`${f.to}T23:59:59`).toISOString());
  if (cursor) p.set("cursor", cursor);
  return p.toString();
};

export const useAudit = (f: AuditFilters, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: ["audit", f],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiFetch<{ items: AuditEntry[]; nextCursor: string | null; total: number }>(`/audit?${qs(f, pageParam)}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useAuditFacets = (enabled: boolean) =>
  useQuery({ queryKey: ["audit", "facets"], enabled, queryFn: () => apiFetch<{ actions: string[]; actors: { id: string; name: string }[] }>("/audit/facets") });
