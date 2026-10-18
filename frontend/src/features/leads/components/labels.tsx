import { CircleAlert, Clock, Globe, Mail, MessageCircle, PenLine, Repeat, UserMinus } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import type { AssignmentReason, LeadSource, LeadStatus, RecoveryCode, SkipReason } from "../api";

const statusTone = {
  unassigned: { tone: "signal", label: "No owner" },
  assigned: { tone: "warn", label: "Waiting for ack" },
  acknowledged: { tone: "ok", label: "Acknowledged" },
  closed: { tone: "neutral", label: "Closed" },
} as const;

export function LeadStatusPill({ status }: { status: LeadStatus }) {
  const s = statusTone[status];
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

const sources: Record<LeadSource, { label: string; icon: typeof Globe }> = {
  webform: { label: "Web form", icon: Globe },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  discord: { label: "Discord", icon: MessageCircle },
  email: { label: "Email", icon: Mail },
  manual: { label: "Manual", icon: PenLine },
};

export function SourceLabel({ source }: { source: LeadSource }) {
  const s = sources[source] ?? sources.manual;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

export const skipLabel: Record<SkipReason, string> = {
  on_leave: "On leave",
  offline: "Offline",
  busy: "Busy",
  at_capacity: "At capacity",
  excluded: "Already had it",
};

export function assignmentTitle(reason: AssignmentReason, level: number, name: string) {
  if (reason === "initial") return `Assigned to ${name}`;
  if (reason === "ack_expired") return `Escalated to ${name} (level ${level})`;
  if (reason === "manual") return `Reassigned to ${name} by a manager`;
  return `Moved to ${name}, previous owner away`;
}

export const endLabel: Record<string, string> = {
  escalated: "window expired",
  reassigned: "reassigned",
  owner_unavailable: "went on leave or offline",
  closed: "lead closed",
  acknowledged: "acknowledged",
};

const recoveryIcon: Record<RecoveryCode, typeof Clock> = {
  unacked_overdue: Clock,
  escalated_multiple: Repeat,
  idle: UserMinus,
};

export function RecoveryReasonLine({ code, text }: { code: RecoveryCode; text: string }) {
  const Icon = recoveryIcon[code] ?? CircleAlert;
  return (
    <span className="inline-flex items-start gap-1.5 text-[13px] text-danger">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </span>
  );
}
