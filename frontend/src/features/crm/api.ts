"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, isApiError } from "@/lib/api";
import { apiFetch } from "@/lib/api/client";
import type { List } from "@/lib/api";

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  optedOut: boolean;
  version: number;
  createdAt: string;
};

export type Company = {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  address: string | null;
  version: number;
};

export type Opportunity = {
  id: string;
  name: string;
  pipelineId: string;
  stageId: string;
  stageName: string;
  contactId: string;
  contactName: string;
  ownerId: string | null;
  ownerName: string | null;
  valueCents?: number;
  currency?: string;
  version: number;
  custom?: Record<string, unknown>;
};

export type Stage = {
  id: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
  requiredFieldIds?: string[];
};

export type CustomField = {
  id: string;
  entity: "contact" | "opportunity";
  pipelineId: string | null;
  name: string;
  type: "text" | "number" | "date" | "dropdown" | "checkbox";
  options: string[] | null;
};

export type Pipeline = {
  id: string;
  name: string;
  isDefault: boolean;
  stages: Stage[];
  fields: CustomField[];
};

export type Activity = {
  id: string;
  type: string;
  actorName: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export type Person = { userId: string; name: string };
export type Tag = { id: string; name: string };

export type ContactFilters = {
  q?: string;
  ownerId?: string;
  companyId?: string;
  tagId?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: string;
  dir?: "asc" | "desc";
  cursor?: string;
};

const page = (filters: ContactFilters) => {
  const params = new URLSearchParams();
  params.set("limit", "50");
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
};

export function useContacts(filters: ContactFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["contacts", filters],
    enabled,
    queryFn: () => apiFetch<List<Contact> & { total?: number }>(`/contacts?${page(filters)}`),
  });
}

export function useCompanies(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["companies", q],
    enabled,
    queryFn: () => apiFetch<List<Company>>(`/companies?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useCompanyChoices(enabled: boolean) {
  return useQuery({
    queryKey: ["companies", "choices"],
    enabled,
    queryFn: () => apiFetch<List<Company>>("/companies?limit=200"),
  });
}

export function usePipelines(enabled: boolean) {
  return useQuery({
    queryKey: ["pipelines"],
    enabled,
    queryFn: () => apiFetch<{ items: Pipeline[] }>("/pipelines"),
  });
}

export function useOpportunities(pipelineId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["opportunities", pipelineId],
    enabled: enabled && Boolean(pipelineId),
    queryFn: () => apiFetch<List<Opportunity>>(`/opportunities?limit=200&pipelineId=${pipelineId}`),
  });
}

export function useFields(entity: "contact" | "opportunity", pipelineId: string | undefined, enabled: boolean) {
  const query = pipelineId ? `&pipelineId=${pipelineId}` : "";
  return useQuery({
    queryKey: ["fields", entity, pipelineId ?? "all"],
    enabled,
    queryFn: () => apiFetch<{ items: CustomField[] }>(`/custom-fields?entity=${entity}${query}`),
  });
}

export function usePeople(enabled: boolean) {
  return useQuery({
    queryKey: ["availability"],
    enabled,
    queryFn: () => apiFetch<{ items: Person[] }>("/availability"),
  });
}

export function useTags(enabled: boolean) {
  return useQuery({
    queryKey: ["tags"],
    enabled,
    queryFn: () => apiFetch<{ items: Tag[] }>("/tags"),
  });
}

export function requiredMissing(error: unknown): { id: string; name: string }[] {
  if (!isApiError(error) || error.code !== "required_fields_missing") return [];
  const raw = error.fields as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is { id: string; name: string } => Boolean(item) && typeof item.id === "string" && typeof item.name === "string");
}

export async function downloadContacts(filters: ContactFilters) {
  const response = await fetch(`/api/contacts/export?${page(filters)}`, { credentials: "include" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code: string; message: string; hint?: string } } | null;
    throw new ApiError(response.status, payload?.error ?? { code: "export_failed", message: "The export failed.", hint: "Try again." });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "contacts.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function useCrmMutations() {
  const client = useQueryClient();
  const refresh = async () => {
    await client.invalidateQueries();
  };
  return {
    createContact: useMutation({
      mutationFn: (body: { name: string; phone?: string; email?: string; companyId?: string; ownerId?: string; custom?: Record<string, unknown> }) =>
        apiFetch("/contacts", { method: "POST", body }),
      onSuccess: refresh,
    }),
    createCompany: useMutation({
      mutationFn: (body: { name: string; domain?: string }) => apiFetch("/companies", { method: "POST", body }),
      onSuccess: refresh,
    }),
    moveOpportunity: useMutation({
      mutationFn: (body: { id: string; stageId: string; version: number; custom?: Record<string, unknown> }) =>
        apiFetch(`/opportunities/${body.id}/move`, { method: "POST", body: { stageId: body.stageId, version: body.version, custom: body.custom } }),
      onSuccess: refresh,
    }),
    updateOpportunity: useMutation({
      mutationFn: (body: { id: string; version: number; name?: string; valueCents?: number; ownerId?: string | null; custom?: Record<string, unknown> }) =>
        apiFetch(`/opportunities/${body.id}`, { method: "PATCH", body }),
      onSuccess: refresh,
    }),
    addNote: useMutation({
      mutationFn: (body: { contactId?: string; opportunityId?: string; body: string }) =>
        apiFetch("/activities/notes", { method: "POST", body }),
      onSuccess: refresh,
    }),
    createPipeline: useMutation({
      mutationFn: (name: string) => apiFetch("/pipelines", { method: "POST", body: { name } }),
      onSuccess: refresh,
    }),
    renamePipeline: useMutation({
      mutationFn: (body: { id: string; name: string }) => apiFetch(`/pipelines/${body.id}`, { method: "PATCH", body: { name: body.name } }),
      onSuccess: refresh,
    }),
    addStage: useMutation({
      mutationFn: (body: { pipelineId: string; name: string }) => apiFetch(`/pipelines/${body.pipelineId}/stages`, { method: "POST", body: { name: body.name } }),
      onSuccess: refresh,
    }),
    updateStage: useMutation({
      mutationFn: (body: { id: string; name?: string; isWon?: boolean; isLost?: boolean }) =>
        apiFetch(`/stages/${body.id}`, { method: "PATCH", body: { name: body.name, isWon: body.isWon, isLost: body.isLost } }),
      onSuccess: refresh,
    }),
    reorderStages: useMutation({
      mutationFn: (body: { pipelineId: string; stageIds: string[] }) =>
        apiFetch(`/pipelines/${body.pipelineId}/stages/order`, { method: "PUT", body: { stageIds: body.stageIds } }),
      onSuccess: refresh,
    }),
    deleteStage: useMutation({
      mutationFn: (body: { id: string; moveTo?: string }) =>
        apiFetch(`/stages/${body.id}${body.moveTo ? `?moveTo=${body.moveTo}` : ""}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    createField: useMutation({
      mutationFn: (body: { entity: "contact" | "opportunity"; pipelineId?: string | null; name: string; type: CustomField["type"]; options?: string[] }) =>
        apiFetch("/custom-fields", { method: "POST", body }),
      onSuccess: refresh,
    }),
    deleteField: useMutation({
      mutationFn: (id: string) => apiFetch(`/custom-fields/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    setRequired: useMutation({
      mutationFn: (body: { stageId: string; fieldIds: string[] }) =>
        apiFetch(`/stages/${body.stageId}/required-fields`, { method: "PUT", body: { fieldIds: body.fieldIds } }),
      onSuccess: refresh,
    }),
  };
}
