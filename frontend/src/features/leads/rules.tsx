"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { fieldErrors, Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { can } from "@/lib/permissions";
import { leadKeys, leadsApi, useMembers, useRules, type AssignmentRules, type EscalationKind } from "./api";

const crumbs = [{ href: "/", label: "Desk" }, { label: "Assignment rules" }];

const kindOptions: { value: EscalationKind; label: string }[] = [
  { value: "next_eligible", label: "Next eligible person" },
  { value: "backup", label: "Designated backup" },
  { value: "manager", label: "Manager" },
];

type LevelDraft = { key: number; kind: EscalationKind; userId: string; seconds: string };

export function AssignmentRulesPage() {
  const me = useMe();
  const allowed = can(me.data, "leads.manage_rules");
  const rules = useRules(me.isSuccess && allowed);

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <PageHeader title="Assignment rules" description="Who receives the next lead, how long they have, and where it goes if they miss it." />
      {me.isSuccess && !allowed ? (
        <EmptyState title="Admins only" body="You need the leads.manage_rules permission to change assignment rules." />
      ) : rules.isLoading || me.isLoading ? (
        <div className="flex max-w-2xl flex-col gap-3" aria-label="Loading rules">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : rules.isError || !rules.data ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={rules.error} />
          <Button size="sm" variant="quiet" onClick={() => void rules.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <RulesForm initial={rules.data} />
      )}
    </>
  );
}

let nextKey = 1;

function RulesForm({ initial }: { initial: AssignmentRules }) {
  const [ack, setAck] = useState(String(initial.ackWindowSeconds));
  const [max, setMax] = useState(String(initial.maxOpenLeads));
  const [idle, setIdle] = useState(String(initial.idleSeconds));
  const [levels, setLevels] = useState<LevelDraft[]>(() =>
    initial.escalationLevels.map((l) => ({ key: nextKey++, kind: l.kind, userId: l.userId ?? "", seconds: String(l.seconds) })),
  );
  const members = useMembers();
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: leadsApi.saveRules,
    onSuccess: (saved) => {
      qc.setQueryData(leadKeys.rules, saved);
      toast("Assignment rules saved", "ok");
    },
    onError: () => toast("Rules were not saved", "signal"),
  });
  const errors = fieldErrors(save.error) ?? {};
  const memberOptions = (members.data?.items ?? []).map((m) => ({
    value: m.userId,
    label: m.name,
    icon: <Avatar name={m.name} id={m.userId} size="xs" status={m.status} />,
  }));

  function update(i: number, patch: Partial<LevelDraft>) {
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function move(i: number, by: -1 | 1) {
    setLevels((ls) => {
      const next = [...ls];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      strategy: "round_robin",
      acknowledgedOnLeavePolicy: "keep_flag_recover",
      ackWindowSeconds: Number(ack),
      maxOpenLeads: Number(max),
      idleSeconds: Number(idle),
      escalationLevels: levels.map((l) => ({
        kind: l.kind,
        seconds: Number(l.seconds),
        ...(l.kind !== "next_eligible" && l.userId ? { userId: l.userId } : {}),
      })),
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-8">
      <Card className="grid gap-4 p-5 sm:grid-cols-3" aria-label="Windows and limits">
        <Field label="Acknowledgement window (seconds)" hint="Use 30s for demos" htmlFor="ack" error={errors.ackWindowSeconds}>
          <Input id="ack" type="number" inputMode="numeric" min={10} required value={ack} onChange={(e) => setAck(e.target.value)} className="tabular-nums" />
        </Field>
        <Field label="Max open leads per person" htmlFor="max" error={errors.maxOpenLeads}>
          <Input id="max" type="number" inputMode="numeric" min={1} required value={max} onChange={(e) => setMax(e.target.value)} className="tabular-nums" />
        </Field>
        <Field label="Idle period (seconds)" hint="No recorded action for this long sends a lead to recovery" htmlFor="idle" error={errors.idleSeconds}>
          <Input id="idle" type="number" inputMode="numeric" min={10} required value={idle} onChange={(e) => setIdle(e.target.value)} className="tabular-nums" />
        </Field>
      </Card>

      <section aria-labelledby="levels-h">
        <h2 id="levels-h" className="text-[16px] font-semibold">
          Escalation chain
        </h2>
        <p className="mt-1 mb-3 text-[13px] text-text-muted">
          When a window expires the lead moves down this list. Each level gets its own window. If nobody at any level can take it, it waits in
          the recovery queue.
        </p>
        <ol className="flex flex-col gap-2">
          {levels.map((l, i) => (
            <li key={l.key} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 animate-row-in">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-text tabular-nums sm:mb-1">{i + 1}</span>
              <Field label="Goes to" className="min-w-44 flex-1">
                <Select label={`Level ${i + 1} goes to`} value={l.kind} onValueChange={(v) => update(i, { kind: v as EscalationKind })} options={kindOptions} />
              </Field>
              {l.kind !== "next_eligible" ? (
                <Field label="Person" className="min-w-40 flex-1" error={errors[`escalationLevels.${i}.userId`]}>
                  <Select
                    label={`Level ${i + 1} person`}
                    placeholder={members.isLoading ? "Loading" : "Pick a person"}
                    value={l.userId || undefined}
                    onValueChange={(v) => update(i, { userId: v })}
                    options={memberOptions}
                  />
                </Field>
              ) : null}
              <Field label="Seconds" className="w-24" error={errors[`escalationLevels.${i}.seconds`]}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  required
                  aria-label={`Level ${i + 1} seconds`}
                  value={l.seconds}
                  onChange={(e) => update(i, { seconds: e.target.value })}
                  className="tabular-nums"
                />
              </Field>
              <span className="flex gap-1 pb-0.5">
                <IconButton label={`Move level ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label={`Move level ${i + 1} down`} disabled={i === levels.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton label={`Remove level ${i + 1}`} onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
        {levels.length < 10 ? (
          <Button
            variant="quiet"
            size="sm"
            className="mt-2"
            onClick={() => setLevels((ls) => [...ls, { key: nextKey++, kind: "next_eligible", userId: "", seconds: "30" }])}
          >
            <Plus className="size-3.5" aria-hidden />
            Add level
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="policy-h" className="rounded-xl bg-tint-blue p-4 text-tint-blue-text">
        <h2 id="policy-h" className="text-[14px] font-semibold">
          When someone goes on leave or offline
        </h2>
        <ul className="mt-1.5 list-disc pl-5 text-[13px]">
          <li>Leads they have not acknowledged move to the next Available person straight away.</li>
          <li>
            Leads they already acknowledged stay with them, marked &ldquo;Owner away&rdquo;. If nothing happens for the idle period they join the
            recovery queue, and a manager can reassign them at any time.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving" : "Save rules"}
        </Button>
        {save.isSuccess && !save.isPending ? <span className="text-[13px] text-ok">Saved</span> : null}
        <Notice error={save.error} />
      </div>
    </form>
  );
}
