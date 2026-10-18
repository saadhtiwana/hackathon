"use client";

import { useEffect, useState } from "react";
import { format, isToday } from "date-fns";
import { AlertCircle, ArrowLeft, Ban, Check, CheckCheck, Clock, Mail, RotateCw, Send } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { channelLabel, useConversations, useRetryMessage, useSendMessage, useThread, type Message, type Scope } from "./api";

const when = (iso: string | null) => (!iso ? "" : isToday(new Date(iso)) ? format(new Date(iso), "HH:mm") : format(new Date(iso), "d MMM"));

export function Inbox() {
  const me = useMe();
  const canAll = can(me.data, "leads.reassign");
  const scopes: { value: Scope; label: string }[] = canAll
    ? [
        { value: "mine", label: "Mine" },
        { value: "unassigned", label: "Unassigned" },
        { value: "all", label: "All" },
      ]
    : [{ value: "mine", label: "Mine" }];
  const [scope, setScope] = useState<Scope>("mine");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setSelected(c);
  }, []);
  const list = useConversations(scope, me.isSuccess);
  const rows = list.data?.items ?? [];

  return (
    <>
      <PageHeader title="Inbox" description="Customer email, one owner per conversation. The owner follows the open lead." />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className={cn("flex min-h-[420px] flex-col overflow-hidden", selected && "hidden lg:flex")}>
          <div className="flex gap-1 border-b border-border p-2" role="tablist" aria-label="Which conversations">
            {scopes.map((s) => (
              <Button
                key={s.value}
                role="tab"
                aria-selected={scope === s.value}
                size="sm"
                variant={scope === s.value ? "dark" : "ghost"}
                onClick={() => {
                  setScope(s.value);
                  setSelected(null);
                }}
              >
                {s.label}
              </Button>
            ))}
          </div>
          {list.isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <div className="flex flex-col items-start gap-2 p-4">
              <Notice error={list.error} />
              <Button size="sm" variant="quiet" onClick={() => void list.refetch()}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="p-5 text-[13px] text-text-muted">
              {scope === "mine" ? "No conversations assigned to you. New customer emails land here once their lead is yours." : "No conversations here."}
            </p>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-current={selected === c.id ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left animate-row-in hover:bg-surface-hover",
                      selected === c.id && "bg-accent-soft",
                    )}
                  >
                    <Avatar name={c.contactName} id={c.contactId} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-medium">{c.contactName}</span>
                        <span className="shrink-0 text-[12px] text-text-muted tabular-nums">{when(c.lastMessageAt)}</span>
                      </span>
                      <span className="block truncate text-[13px] text-text-muted">
                        {c.lastMessage ? `${c.lastMessage.direction === "out" ? "You: " : ""}${c.lastMessage.body}` : "No messages yet"}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[12px] text-text-muted">
                        {c.ownerId ? (
                          <>
                            <Avatar name={c.ownerName ?? "Owner"} id={c.ownerId} size="xs" />
                            {c.ownerId === me.data?.user.id ? "You" : c.ownerName}
                          </>
                        ) : (
                          "Unassigned"
                        )}
                        {c.lastMessage?.status === "failed" ? <Badge tone="signal">Failed</Badge> : null}
                        {c.optedOut ? <Badge>Opted out</Badge> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className={cn(!selected && "hidden lg:block")}>
          {selected ? (
            <ThreadView id={selected} onBack={() => setSelected(null)} />
          ) : (
            <EmptyState icon={Mail} title="Pick a conversation" body="Messages show their delivery status. Failed ones say why and can be retried." />
          )}
        </div>
      </div>
    </>
  );
}

function StatusLine({ m, onRetry, retrying }: { m: Message; onRetry: () => void; retrying: boolean }) {
  if (m.direction === "in") return null;
  const map = {
    queued: { icon: Clock, text: "Queued", cls: "text-text-muted" },
    sent: { icon: Check, text: "Sent", cls: "text-text-muted" },
    delivered: { icon: CheckCheck, text: "Delivered", cls: "text-ok" },
    read: { icon: CheckCheck, text: "Read", cls: "text-ok" },
    failed: { icon: AlertCircle, text: "Failed", cls: "text-danger" },
    received: { icon: Check, text: "Received", cls: "text-text-muted" },
  } as const;
  const s = map[m.status] ?? map.sent;
  const Icon = s.icon;
  return (
    <span className={cn("mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px]", s.cls)}>
      <Icon className="size-3.5" aria-hidden />
      <span>
        {s.text}
        {m.status === "failed" && m.errorMessage ? `: ${m.errorMessage}` : ""}
      </span>
      {m.status === "failed" ? (
        <Button size="sm" variant="quiet" disabled={retrying} onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden />
          {retrying ? "Retrying" : "Retry"}
        </Button>
      ) : null}
    </span>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const me = useMe();
  const thread = useThread(id);
  const send = useSendMessage(id);
  const retry = useRetryMessage();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const canEdit = can(me.data, "crm.edit");

  if (thread.isLoading) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-2/3" />
      </Card>
    );
  }
  if (thread.isError || !thread.data) {
    return (
      <Card className="flex flex-col items-start gap-3 p-5">
        <IconButton label="Back to conversations" className="lg:hidden" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <Notice error={thread.error} />
        <Button size="sm" variant="quiet" onClick={() => void thread.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  const { conversation: c, messages } = thread.data;
  const blocked = c.optedOut;

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || blocked) return;
    send.mutate(body, {
      onSuccess: () => {
        setDraft("");
        toast("Queued. It turns to Sent once the mailbox accepts it.", "ok");
      },
    });
  }

  return (
    <Card className="flex min-h-[420px] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <IconButton label="Back to conversations" className="lg:hidden" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <Avatar name={c.contactName} id={c.contactId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{c.contactName}</p>
          <span className="flex items-center gap-2 text-[12px] text-text-muted">
            <Badge tone="accent">
              <Mail className="mr-1 size-3" aria-hidden />
              {channelLabel(c.channel)}
            </Badge>
            {c.owner ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={c.owner.name} id={c.owner.id} size="xs" />
                Assigned to {c.owner.id === me.data?.user.id ? "you" : c.owner.name}
              </span>
            ) : (
              "Nobody assigned"
            )}
          </span>
        </div>
      </header>

      <ol className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-label={`Messages with ${c.contactName}`}>
        {messages.length === 0 ? <li className="text-[13px] text-text-muted">No messages yet. Say hello below.</li> : null}
        {messages.map((m) => (
          <li key={m.id} className={cn("flex max-w-[85%] flex-col animate-row-in", m.direction === "out" ? "self-end items-end" : "self-start items-start")}>
            <div
              className={cn(
                "rounded-xl px-3.5 py-2.5 text-[14px] whitespace-pre-wrap",
                m.direction === "out" ? "bg-accent-soft text-text" : "bg-surface-muted text-text",
                m.status === "failed" && "ring-1 ring-[color-mix(in_srgb,var(--danger)_40%,transparent)]",
              )}
            >
              {m.body}
            </div>
            <span className="mt-1 text-[11px] text-text-muted tabular-nums">{format(new Date(m.createdAt), "d MMM, HH:mm")}</span>
            <StatusLine
              m={m}
              retrying={retry.isPending && retry.variables === m.id}
              onRetry={() =>
                retry.mutate(m.id, {
                  onSuccess: () => toast("Sent again. Watch the new message's status.", "ok"),
                  onError: (e) => toast(e.message, "signal"),
                })
              }
            />
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className="border-t border-border p-3">
        {blocked ? (
          <p className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-[13px] text-text-muted" role="status">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            {c.contactName} opted out of messages{c.optOutReason ? `: ${c.optOutReason}` : ""}. Replies are disabled until they contact you again.
          </p>
        ) : !canEdit ? (
          <p className="text-[13px] text-text-muted">You can read this conversation but need edit rights to reply.</p>
        ) : (
          <>
            <Label htmlFor="reply" className="sr-only">
              Reply to {c.contactName}
            </Label>
            <Textarea
              id="reply"
              placeholder={`Reply to ${c.contactName} by email`}
              value={draft}
              maxLength={5000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              className="min-h-20"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-text-muted">Ctrl + Enter to send</span>
              <Button type="submit" disabled={!draft.trim() || send.isPending}>
                <Send className="size-3.5" aria-hidden />
                {send.isPending ? "Sending" : "Send"}
              </Button>
            </div>
            <div className="mt-2">
              <Notice error={send.error} />
            </div>
          </>
        )}
      </form>
    </Card>
  );
}
