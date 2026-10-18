"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

// The address customers can email instead of using the web form (public, no sign-in).
export const useAgencyEmail = (slug: string) =>
  useQuery({
    queryKey: ["agency-email", slug],
    queryFn: () => apiFetch<{ email: string | null }>(`/public/agency-contact/${encodeURIComponent(slug)}`),
    staleTime: 5 * 60_000,
    retry: false,
  });
