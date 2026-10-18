"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { can } from "@/lib/permissions";
import { useRecovery } from "@/features/leads/api";
import { ReassignDialog } from "@/features/leads/components/reassign-dialog";
import type { DashboardData } from "../api";
import { CardState, DashCard } from "./dash-card";

export function UpcomingAppointments({ data, query }: { data?: DashboardData; query: Parameters<typeof CardState>[0]["query"] }) {
  const items = data?.upcomingAppointments.items ?? [];
  return (
    <DashCard title="Upcoming appointments" href="/appointments">
      <CardState query={query} height="h-40">
        {items.length === 0 ? (
          <p className="text-[13px] text-text-muted">Nothing booked for the next 7 days.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-border p-3 animate-row-in">
                <span className="flex w-14 shrink-0 flex-col">
                  <span className="text-[11px] text-text-muted">{formatInTimeZone(a.startsAt, a.timezone, "EEE d")}</span>
                  <span className="text-[15px] font-semibold tabular-nums">{formatInTimeZone(a.startsAt, a.timezone, "HH:mm")}</span>
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar name={a.contactName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{a.title}</span>
                    <span className="block truncate text-[12px] text-text-muted">
                      {a.contactName} · {a.userName}
                    </span>
                  </span>
                </span>
                <Link href="/appointments" aria-label={`Open ${a.title}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text">
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && data.upcomingAppointments.count > 4 ? (
          <Link href="/appointments" className="mt-3 inline-flex text-[13px] font-medium text-accent-text hover:underline">
            See all {data.upcomingAppointments.count}
          </Link>
        ) : null}
      </CardState>
    </DashCard>
  );
}

export function NeedsAttention() {
  const me = useMe();
  const manager = can(me.data, "leads.reassign");
  const queue = useRecovery(me.isSuccess && manager);
  // people without leads.reassign see their own recovery items from the dashboard records
  const own = useQuery({
    queryKey: ["leads", "dashboard-recovery"],
    queryFn: () => apiFetch<{ items: { id: string; title: string; detail: string; href: string }[] }>("/dashboard/records/recovery?limit=4"),
    enabled: me.isSuccess && !manager,
  });

  if (!manager) {
    return (
      <DashCard title="Needs attention" href="/leads">
        <CardState query={own} height="h-32">
          {!own.data?.items.length ? (
            <p className="text-[13px] text-text-muted">None of your leads are slipping.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {own.data.items.map((x) => (
                <li key={x.id} className="flex items-start gap-3 rounded-2xl border border-border p-3">
                  <Avatar name={x.title} size="md" />
                  <span className="min-w-0">
                    <Link href={x.href} className="block truncate text-[13px] font-semibold hover:underline">
                      {x.title}
                    </Link>
                    <span className="block text-[12px] text-danger">{x.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardState>
      </DashCard>
    );
  }

  const items = (queue.data?.items ?? []).slice(0, 4);
  return (
    <DashCard title="Needs attention" href="/recovery">
      <CardState query={queue} height="h-40">
        {items.length === 0 ? (
          <p className="text-[13px] text-text-muted">The recovery queue is empty. Every lead has an owner on it.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map(({ lead, reasons }) => (
              <li key={lead.id} className="flex items-start gap-3 rounded-2xl border border-border p-3 animate-row-in">
                <Avatar name={lead.contactName ?? "Lead"} id={lead.contactId} size="md" />
                <span className="min-w-0 flex-1">
                  <Link href={`/leads/${lead.id}`} className="block truncate text-[13px] font-semibold hover:underline">
                    {lead.contactName || "Unnamed contact"}
                  </Link>
                  <span className="block text-[12px] text-danger">{reasons[0]?.text}</span>
                  <span className="mt-2 block">
                    <ReassignDialog
                      lead={lead}
                      trigger={
                        <Button size="sm" variant="quiet" className="h-7 rounded-full px-3">
                          Reassign
                        </Button>
                      }
                    />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardState>
    </DashCard>
  );
}
