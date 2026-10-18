"use client";

import { format } from "date-fns";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import type { Activity } from "./api";

const labels: Record<string, string> = {
  note: "Note",
  call_log: "Call",
  stage_change: "Stage change",
  assignment: "Assignment",
  field_edit: "Field edit",
  message: "Message",
  payment: "Payment",
  appointment: "Appointment",
  lead_ack: "Acknowledged",
  lead_escalation: "Escalation",
};

function detail(activity: Activity) {
  const data = activity.data ?? {};
  if (typeof activity.summary === "string" && activity.summary) return activity.summary;
  if (typeof data.body === "string") return data.body;
  if (typeof data.from === "string" || typeof data.to === "string") return `${data.from ?? "—"} → ${data.to ?? "—"}`;
  if (data.event === "created") return "Record created";
  return null;
}

export function ActivityTimeline({ items }: { items: Activity[] }) {
  if (items.length === 0) return <p className="text-[14px] text-text-muted">Nothing recorded yet.</p>;
  return (
    <Timeline>
      {items.map((item) => (
        <TimelineItem
          key={item.id}
          title={labels[item.type] ?? item.type}
          meta={`${item.actorName ?? "System"} · ${format(new Date(item.createdAt), "d MMM, HH:mm")}`}
          body={detail(item)}
        />
      ))}
    </Timeline>
  );
}
