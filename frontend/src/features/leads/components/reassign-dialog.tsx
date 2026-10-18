"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useMembers, useReassign, type Lead } from "../api";

const statusWord = { available: "Available", busy: "Busy", on_leave: "On leave", offline: "Offline" } as const;

export function ReassignDialog({ lead, trigger }: { lead: Lead; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [toUserId, setToUserId] = useState("");
  const members = useMembers();
  const reassign = useReassign();
  const toast = useToast();

  const all = members.data?.items ?? [];
  const eligible = all.filter((m) => m.status === "available" && m.userId !== lead.ownerId);
  const unavailable = all.filter((m) => m.status !== "available" && m.userId !== lead.ownerId);

  function submit() {
    if (!toUserId) return;
    reassign.mutate(
      { id: lead.id, toUserId, version: lead.version },
      {
        onSuccess: () => {
          toast(`Reassigned to ${all.find((m) => m.userId === toUserId)?.name ?? "the new owner"}`, "ok");
          setOpen(false);
          setToUserId("");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reassign.reset();
      }}
      trigger={trigger}
      title="Reassign lead"
      description="The new owner gets a fresh acknowledgement window. Only Available people can take it."
    >
      <div className="flex flex-col gap-4">
        <Field label="New owner">
          <Select
            label="New owner"
            placeholder={members.isLoading ? "Loading people" : eligible.length ? "Pick someone" : "Nobody is Available"}
            value={toUserId || undefined}
            onValueChange={setToUserId}
            disabled={!eligible.length}
            options={eligible.map((m) => ({
              value: m.userId,
              label: `${m.name} · ${m.openLeads} open`,
              icon: <Avatar name={m.name} id={m.userId} size="xs" status={m.status} />,
            }))}
          />
        </Field>
        {unavailable.length ? (
          <p className="text-[12px] text-text-muted">
            Not available: {unavailable.map((m) => `${m.name} (${statusWord[m.status]})`).join(", ")}
          </p>
        ) : null}
        <Notice error={reassign.error} />
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!toUserId || reassign.isPending}>
            {reassign.isPending ? "Reassigning" : "Reassign"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
