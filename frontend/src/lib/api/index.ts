import { apiFetch } from "./client";
import type { Availability, List, Me } from "./types";

export { ApiError, isApiError } from "./client";
export type { ApiErrorBody } from "./client";
export type { Availability, List, Me, RealtimeEvent } from "./types";

export const api = {
  signup: (body: { workspaceName: string; name: string; email: string; password: string }) =>
    apiFetch<{ user: Me["user"]; workspace: { id: string; name: string } }>("/auth/signup", {
      method: "POST",
      body,
    }),
  login: (body: { email: string; password: string; workspaceId?: string }) =>
    apiFetch<{ user: Me["user"]; workspaceId: string }>("/auth/login", { method: "POST", body }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  acceptInvite: (body: { token: string; name: string; password: string }) =>
    apiFetch<{ user: Me["user"]; workspaceId: string }>("/auth/accept-invite", {
      method: "POST",
      body,
    }),
  me: () => apiFetch<Me>("/me"),
  setAvailability: (status: Availability) =>
    apiFetch<{ status: Availability; reassigned?: number; flaggedAway?: number }>("/me/availability", {
      method: "PUT",
      body: { status },
    }),
  realtimeTicket: () =>
    apiFetch<{ ticket: string; expiresAt: string }>("/realtime/ticket"),
  leads: (query = "") => apiFetch<List<{ id: string }>>(`/leads${query}`),
};
