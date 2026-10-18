"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { DropdownItem, DropdownMenu } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api/client";

type Note = { id: string; kind: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

// Header bell: this user's notifications, refreshed by the realtime hook (key "notifications").
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => apiFetch<{ items: Note[]; unread: number }>("/notifications"), refetchInterval: 60_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["notifications"] });
  const readAll = useMutation({ mutationFn: () => apiFetch<void>("/notifications/read-all", { method: "POST" }), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: string) => apiFetch<void>(`/notifications/${id}/read`, { method: "POST" }), onSuccess: refresh });
  const unread = q.data?.unread ?? 0;
  return (
    <DropdownMenu
      label="Notifications"
      trigger={
        <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text">
          <Bell className="size-[18px]" aria-hidden />
          {unread ? <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-on-danger tabular-nums">{unread > 9 ? "9+" : unread}</span> : null}
        </button>
      }
    >
      <div className="flex w-[min(340px,86vw)] items-center justify-between px-2.5 py-1.5">
        <span className="text-[13px] font-semibold">Notifications</span>
        <button type="button" className="text-[12px] text-text-muted underline disabled:opacity-50" disabled={!unread || readAll.isPending} onClick={(e) => { e.stopPropagation(); readAll.mutate(); }}>
          Mark all read
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {q.isError ? <p className="px-2.5 py-3 text-[13px] text-text-muted">Could not load notifications.</p> : null}
        {q.data && q.data.items.length === 0 ? <p className="px-2.5 py-3 text-[13px] text-text-muted">Nothing yet. Assignments, escalations, replies and payments show up here.</p> : null}
        {q.data?.items.map((n) => (
          <DropdownItem
            key={n.id}
            className="h-auto items-start gap-2 py-2"
            onSelect={() => {
              if (!n.readAt) readOne.mutate(n.id);
              if (n.href) router.push(n.href);
            }}
          >
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-danger"}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium whitespace-normal">{n.title}</span>
              {n.body ? <span className="block truncate text-[12px] text-text-muted">{n.body}</span> : null}
              <span className="block text-[11px] text-text-muted">{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span>
            </span>
          </DropdownItem>
        ))}
      </div>
    </DropdownMenu>
  );
}
