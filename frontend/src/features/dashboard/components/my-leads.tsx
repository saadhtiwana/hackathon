"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Countdown } from "@/components/ui/countdown";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useAcknowledge, useLeads } from "@/features/leads/api";
import { SourceLabel } from "@/features/leads/components/labels";
import { CardState, DashCard } from "./dash-card";

const tints = ["bg-surface-muted"];

export function MyLeads() {
  const me = useMe();
  const leads = useLeads({ status: "assigned", mine: true }, me.isSuccess);
  const ack = useAcknowledge();
  const toast = useToast();
  const rows = (leads.data?.items ?? []).slice(0, 5);
  const more = (leads.data?.items.length ?? 0) - rows.length;

  return (
    <DashCard title="My leads" href="/leads">
      <CardState query={leads} height="h-72">
        {rows.length === 0 ? (
          <p className="rounded-xl bg-surface-muted p-4 text-[13px] text-text-muted">Nothing waiting on you. New leads land here with their countdown.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((l, i) => (
              <li key={l.id} className={cn("relative rounded-2xl p-4 animate-row-in", tints[i % tints.length])}>
                <button
                  type="button"
                  aria-label={`Acknowledge ${l.contactName ?? "lead"}`}
                  title="Acknowledge"
                  disabled={ack.isPending && ack.variables === l.id}
                  onClick={() =>
                    ack.mutate(l.id, {
                      onSuccess: () => toast(`${l.contactName ?? "Lead"} acknowledged`, "ok"),
                      onError: (e) => toast(e.message, "signal"),
                    })
                  }
                  className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full border border-border-strong bg-white/60 text-text hover:bg-white dark:bg-black/20"
                >
                  <Check className="size-4" aria-hidden />
                </button>
                <span className="flex items-center gap-2.5 pr-9">
                  <Avatar name={l.contactName ?? "Lead"} id={l.contactId} size="md" />
                  <span className="min-w-0">
                    <Link href={`/leads/${l.id}`} className="block truncate text-[14px] font-semibold text-text hover:underline">
                      {l.contactName || "Unnamed contact"}
                    </Link>
                    <SourceLabel source={l.source} />
                  </span>
                </span>
                {l.ackDeadline ? (
                  <span className="mt-3 block">
                    <Countdown deadline={l.ackDeadline} startedAt={l.assignedAt} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Link href="/leads" className="mt-4 inline-flex text-[13px] font-medium text-accent-text hover:underline">
          {more > 0 ? `See all (${more} more)` : "See all leads"}
        </Link>
      </CardState>
    </DashCard>
  );
}
