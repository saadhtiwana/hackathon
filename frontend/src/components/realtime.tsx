"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, isApiError, type RealtimeEvent } from "@/lib/api";
import { useMe } from "@/components/session";

const keys: Record<string, string[][]> = {
  "lead.created": [["leads"]],
  "lead.assigned": [["leads"]],
  "lead.escalated": [["leads"]],
  "lead.acknowledged": [["leads"]],
  "message.received": [["conversations"]],
  "message.status": [["conversations"]],
  "payment.updated": [["payments"]],
  "appointment.updated": [["appointments"]],
  "availability.changed": [["me"], ["availability"]],
};

export function Realtime() {
  const me = useMe();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!me.isSuccess) return;
    let socket: EventSource | null = null;
    let timer: number | undefined;
    let stopped = false;
    let delay = 1000;
    const base = process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:4000";

    async function connect() {
      try {
        const { ticket } = await api.realtimeTicket();
        if (stopped) return;
        socket = new EventSource(`${base}/realtime/stream?ticket=${encodeURIComponent(ticket)}`);
        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data) as RealtimeEvent;
          delay = 1000;
          for (const key of keys[payload.type] ?? []) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        };
        socket.onerror = () => {
          socket?.close();
          if (stopped) return;
          timer = window.setTimeout(() => {
            delay = Math.min(delay * 2, 30_000);
            void connect();
          }, delay);
          void queryClient.invalidateQueries({ queryKey: ["leads"] });
        };
      } catch (error) {
        if (stopped || (isApiError(error) && error.status === 401)) return;
        timer = window.setTimeout(() => void connect(), delay);
      }
    }

    void connect();
    return () => {
      stopped = true;
      socket?.close();
      if (timer) window.clearTimeout(timer);
    };
  }, [me.isSuccess, queryClient]);

  return null;
}
