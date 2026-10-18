"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type Scope = "mine" | "unassigned" | "all";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "received";

export type ConversationRow = {
  id: string;
  contactId: string;
  contactName: string;
  optedOut: boolean;
  channel: string;
  ownerId: string | null;
  ownerName: string | null;
  lastMessageAt: string | null;
  lastMessage: { body: string; direction: "in" | "out"; status: MessageStatus } | null;
};

export type Message = {
  id: string;
  direction: "in" | "out";
  body: string;
  status: MessageStatus;
  errorCode: string | null;
  errorMessage: string | null;
  retryOf: string | null;
  sentBy: string | null;
  createdAt: string;
};

export type Thread = {
  conversation: {
    id: string;
    channel: string;
    contactId: string;
    contactName: string;
    optedOut: boolean;
    optOutReason: string | null;
    owner: { id: string; name: string } | null;
  };
  messages: Message[];
};

// "conversations" is invalidated by the realtime hook on message.received and message.status
export const inboxKeys = {
  all: ["conversations"] as const,
  list: (scope: Scope) => ["conversations", "list", scope] as const,
  thread: (id: string) => ["conversations", "thread", id] as const,
};

export function useConversations(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: inboxKeys.list(scope),
    queryFn: () => apiFetch<{ items: ConversationRow[] }>(`/conversations?scope=${scope}&limit=100`),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useThread(id: string | null) {
  return useQuery({
    queryKey: inboxKeys.thread(id ?? ""),
    queryFn: () => apiFetch<Thread>(`/conversations/${id}?limit=100`),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiFetch<{ message: Message }>(`/conversations/${conversationId}/messages`, { method: "POST", body: { body } }),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useRetryMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ message: Message }>(`/messages/${id}/retry`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export const channelLabel = (c: string) => (c === "email" ? "Email" : c === "discord" ? "Discord" : c.charAt(0).toUpperCase() + c.slice(1));
