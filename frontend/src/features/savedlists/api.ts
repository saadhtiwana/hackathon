"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type Entity = "contacts" | "opportunities";
export type Criterion = { field: string; op: string; value: string | number | boolean };
export type SchemaField = { key: string; label: string; ops: string[]; type?: string; options?: string[] | null };
export type SavedList = { id: string; name: string; entity: Entity; criteria: Criterion[] };
export type Row = Record<string, string | number | boolean | null>;

export const OP_LABEL: Record<string, string> = { is: "is", is_not: "is not", contains: "contains", gt: ">", gte: "≥", lt: "<", lte: "≤", before: "before", after: "after", on: "on" };

export const useSchema = () => useQuery({ queryKey: ["saved-lists", "schema"], queryFn: () => apiFetch<Record<Entity, SchemaField[]>>("/saved-lists/schema"), staleTime: 60_000 });
export const useSavedLists = () => useQuery({ queryKey: ["saved-lists", "all"], queryFn: () => apiFetch<{ items: SavedList[] }>("/saved-lists") });
// Live: refetched on focus, on an interval and on realtime events, so rows appear and disappear as records start or stop matching.
export const useResults = (id: string) =>
  useQuery({ queryKey: ["saved-lists", "results", id], queryFn: () => apiFetch<{ list: SavedList; items: Row[]; total: number }>(`/saved-lists/${id}/results?limit=100`), refetchInterval: 15_000 });
export const usePreview = (entity: Entity, criteria: Criterion[], enabled: boolean) =>
  useQuery({ queryKey: ["saved-lists", "preview", entity, criteria], enabled, queryFn: () => apiFetch<{ items: Row[]; total: number }>("/saved-lists/preview", { method: "POST", body: { entity, criteria, limit: 50 } }) });

export function useListMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["saved-lists"] });
  return {
    create: useMutation({ mutationFn: (b: { name: string; entity: Entity; criteria: Criterion[] }) => apiFetch<{ list: SavedList }>("/saved-lists", { method: "POST", body: b }), onSuccess: done }),
    rename: useMutation({ mutationFn: (b: { id: string; name: string }) => apiFetch(`/saved-lists/${b.id}`, { method: "PATCH", body: { name: b.name } }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => apiFetch<void>(`/saved-lists/${id}`, { method: "DELETE" }), onSuccess: done }),
  };
}
