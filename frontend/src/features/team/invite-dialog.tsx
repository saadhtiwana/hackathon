"use client";

import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldErrors, Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { levelLabel, useInvite, type BaseLevel, type Role } from "./api";

export function InviteDialog({ roles, actor }: { roles: Role[]; actor: BaseLevel }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const allowed = roles.filter((r) => r.baseLevel !== "owner" && (actor === "owner" || r.baseLevel === "user"));
  const [roleId, setRoleId] = useState("");
  const invite = useInvite();
  const toast = useToast();
  const errors = fieldErrors(invite.error) ?? {};
  const url = invite.data?.inviteUrl;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      toast("Invite link copied", "ok");
    } catch {
      toast("Select the link and copy it by hand", "signal");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          invite.reset();
          setEmail("");
        }
      }}
      trigger={
        <Button>
          <UserPlus className="size-4" aria-hidden />
          Invite
        </Button>
      }
      title="Invite a teammate"
      description="They get a link to set their name and password. It expires in a few days."
    >
      {url ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px]">Send this link to {invite.data?.email}:</p>
          <Input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => invite.reset()}>
              Invite someone else
            </Button>
            <Button onClick={() => void copy()}>
              <Copy className="size-4" aria-hidden />
              Copy link
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate({ email: email.trim(), roleId: roleId || allowed[0]?.id });
          }}
        >
          <Field label="Email" htmlFor="invite-email" error={errors.email}>
            <Input id="invite-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" error={errors.roleId}>
            <Select
              label="Role"
              value={roleId || allowed[0]?.id}
              onValueChange={setRoleId}
              options={allowed.map((r) => ({ value: r.id, label: `${r.name} (${levelLabel[r.baseLevel]})` }))}
            />
          </Field>
          <Notice error={invite.error} />
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!email.trim() || !allowed.length || invite.isPending}>
              {invite.isPending ? "Creating invite" : "Create invite"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
