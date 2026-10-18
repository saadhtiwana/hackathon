"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { Check, UserRoundX } from "lucide-react";
import { useMe } from "@/components/session";
import { BookingDialog } from "@/features/appointments/booking-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { BigTimer, Countdown } from "@/components/ui/countdown";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useAcknowledge, useCloseLead, useLead, useMemberNames, type Assignment, type Lead } from "./api";
import { assignmentTitle, endLabel, LeadStatusPill, RecoveryReasonLine, skipLabel, SourceLabel } from "./components/labels";
import { Owner } from "./components/owner";
import { ReassignDialog } from "./components/reassign-dialog";
import { formatDuration, useServerNow } from "./time";

const clock = (iso: string) => format(new Date(iso), "d MMM, HH:mm:ss");

export function LeadDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useMe();
  const detail = useLead(id);
  const nameOf = useMemberNames();

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading lead">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    const missing = isApiError(detail.error) && detail.error.status === 404;
    return (
      <>
        <Breadcrumbs items={[{ href: "/leads", label: "Leads" }, { label: "Lead" }]} />
        {missing ? (
          <p className="text-[14px] text-text-muted">This lead does not exist, or it is not yours to see.</p>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <Notice error={detail.error} />
            <Button size="sm" variant="quiet" onClick={() => void detail.refetch()}>
              Retry
            </Button>
          </div>
        )}
      </>
    );
  }

  const { lead, contact, assignments, recoveryReasons } = detail.data;
  const myId = me.data?.user.id;
  const isOwner = lead.ownerId === myId;
  const canReassign = can(me.data, "leads.reassign");
  const title = contact?.name || lead.contactName || "Lead";

  return (
    <>
      <Breadcrumbs items={[{ href: "/leads", label: "Leads" }, { label: title }]} />
      <PageHeader
        title={title}
        description={[contact?.phone, contact?.email].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <LeadActions lead={lead} isOwner={isOwner} canReassign={canReassign} />
            {lead.status !== "closed" && can(me.data, "crm.edit") ? <BookingDialog contactId={lead.contactId} contactName={title} opportunityId={lead.opportunityId ?? undefined} /> : null}
          </div>
        }
      />

      <div className={lead.status === "assigned" && lead.ackDeadline ? "mb-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]" : "mb-6"}>
      <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3">
        <Fact label="Status">
          <span className="flex flex-wrap items-center gap-2">
            <LeadStatusPill status={lead.status} />
            {lead.ownerAway ? (
              <Badge tone="warn">
                <UserRoundX className="mr-1 size-3" aria-hidden />
                Owner away
              </Badge>
            ) : null}
          </span>
        </Fact>
        <Fact label="Owner">
          <span className="text-[14px]">
            <Owner id={lead.ownerId} me={myId} size="md" />
          </span>
        </Fact>
        <Fact label="Time to acknowledge">
          {lead.status === "assigned" && lead.ackDeadline ? (
            <Countdown deadline={lead.ackDeadline} startedAt={lead.assignedAt} />
          ) : (
            <span className="text-[13px] text-text-muted">{lead.status === "acknowledged" ? "Acknowledged" : "–"}</span>
          )}
        </Fact>
        <Fact label="Source">
          <SourceLabel source={lead.source} />
        </Fact>
        <Fact label="Escalations">
          <span className="text-[20px] leading-none font-semibold tabular-nums">{lead.escalationCount}</span>
        </Fact>
        <Fact label="Created">
          <span className="text-[13px] tabular-nums">{clock(lead.createdAt)}</span>
        </Fact>
      </dl>
      </Card>
      {lead.status === "assigned" && lead.ackDeadline ? (
        <Card className="flex flex-col justify-center p-5">
          <p className="mb-3 text-[13px] font-medium text-text-muted">{isOwner ? "Your window" : `${nameOf(lead.ownerId)}'s window`}</p>
          <BigTimer deadline={lead.ackDeadline} startedAt={lead.assignedAt} />
        </Card>
      ) : null}
      </div>

      {recoveryReasons.length ? (
        <section className="mb-6 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] p-4" aria-labelledby="recovery-h">
          <h2 id="recovery-h" className="mb-2 text-[14px] font-semibold">
            In the recovery queue
          </h2>
          <ul className="flex flex-col gap-1">
            {recoveryReasons.map((r) => (
              <li key={r.code}>
                <RecoveryReasonLine code={r.code} text={r.text} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lead.ownerAway ? (
        <p className="mb-6 rounded-xl bg-tint-yellow p-4 text-[13px] text-tint-yellow-text">
          The owner went on leave or offline after acknowledging. The lead stays with them and moves to the recovery queue if nothing happens for
          the idle period. A manager can reassign it at any time.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Custody chain" description="Everyone who has held this lead, and why it moved." />
          <div className="p-5">
            {assignments.length ? (
              <CustodyChain assignments={assignments} />
            ) : (
              <p className="text-[13px] text-text-muted">Nobody has held this lead yet.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Skipped" description="Passed over by round-robin or escalation." />
          <div className="p-5">
            <SkippedList assignments={assignments} nameOf={nameOf} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12px] font-medium text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CustodyChain({ assignments }: { assignments: Assignment[] }) {
  const now = useServerNow();
  return (
    <Timeline>
      {assignments.map((a) => {
        const start = new Date(a.assignedAt).getTime();
        const held = a.endedAt
          ? `Held ${formatDuration((new Date(a.endedAt).getTime() - start) / 1000)}, ended: ${endLabel[a.endReason ?? ""] ?? a.endReason ?? "ended"}`
          : now
            ? `Holding for ${formatDuration((now - start) / 1000)}`
            : "Holding now";
        return (
          <TimelineItem
            key={a.id}
            title={assignmentTitle(a.reason, a.level, a.userName)}
            meta={clock(a.assignedAt)}
            body={held}
            current={!a.endedAt}
            avatar={<Avatar name={a.userName} id={a.userId} size="md" />}
          />
        );
      })}
    </Timeline>
  );
}

function SkippedList({ assignments, nameOf }: { assignments: Assignment[]; nameOf: (id: string) => string }) {
  const withSkips = assignments.filter((a) => a.skipped.length);
  if (!withSkips.length) return <p className="text-[13px] text-text-muted">Nobody was passed over.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {withSkips.map((a) => (
        <li key={a.id} className="text-[13px]">
          <p className="text-[12px] text-text-muted">When it went to {a.userName}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {a.skipped.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Avatar name={nameOf(s.userId)} id={s.userId} size="xs" />
                  <span className="truncate">{nameOf(s.userId)}</span>
                </span>
                <Badge tone={s.reason === "at_capacity" ? "warn" : "neutral"}>{skipLabel[s.reason] ?? s.reason}</Badge>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function LeadActions({ lead, isOwner, canReassign }: { lead: Lead; isOwner: boolean; canReassign: boolean }) {
  const ack = useAcknowledge();
  const toast = useToast();
  if (lead.status === "closed") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {isOwner && lead.status === "assigned" ? (
        <Button
          disabled={ack.isPending}
          onClick={() =>
            ack.mutate(lead.id, {
              onSuccess: () => toast("Acknowledged. The lead is yours.", "ok"),
              onError: (e) => toast(e.message, "signal"),
            })
          }
        >
          <Check className="size-4" aria-hidden />
          Acknowledge
        </Button>
      ) : null}
      {canReassign ? (
        <ReassignDialog
          lead={lead}
          trigger={
            <Button variant="quiet">Reassign</Button>
          }
        />
      ) : null}
      {isOwner || canReassign ? <CloseDialog lead={lead} /> : null}
    </div>
  );
}

function CloseDialog({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const close = useCloseLead();
  const toast = useToast();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) close.reset();
      }}
      trigger={<Button variant="ghost">Close lead</Button>}
      title="Close this lead"
      description="Closed leads stop counting down and leave the recovery queue."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          close.mutate(
            { id: lead.id, outcome: outcome.trim() || undefined },
            {
              onSuccess: () => {
                toast("Lead closed", "ok");
                setOpen(false);
              },
            },
          );
        }}
      >
        <Field label="Outcome" hint="Optional, for example won, lost or duplicate" htmlFor="close-outcome">
          <Input id="close-outcome" value={outcome} maxLength={200} onChange={(e) => setOutcome(e.target.value)} />
        </Field>
        <Notice error={close.error} />
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="dark" disabled={close.isPending}>
            {close.isPending ? "Closing" : "Close lead"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
