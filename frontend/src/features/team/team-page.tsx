"use client";

import { Users } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { format } from "date-fns";
import { can } from "@/lib/permissions";
import { editBlock, levelLabel, useCalendars, useInvites, useMembers, useRevokeInvite, useRoles, useUpdateMember, type Member } from "./api";
import { InviteDialog } from "./invite-dialog";
import { RolesMatrix } from "./roles-matrix";

const availability = { available: "Available", busy: "Busy", on_leave: "On leave", offline: "Offline" } as const;
const calendar = { connected: ["ok", "Calendar connected"], not_connected: ["neutral", "No calendar"], needs_reconnect: ["signal", "Reconnect calendar"] } as const;

export function TeamPage() {
  const me = useMe();
  const allowed = can(me.data, "users.manage");
  const members = useMembers(me.isSuccess && allowed);
  const roles = useRoles(me.isSuccess && allowed);
  const invites = useInvites(me.isSuccess && allowed);
  const calendars = useCalendars(me.isSuccess && allowed);
  const update = useUpdateMember();
  const revoke = useRevokeInvite();
  const toast = useToast();
  const actor = me.data?.role.baseLevel ?? "user";
  const roleList = roles.data?.items ?? [];
  const calBy = new Map((calendars.data?.items ?? []).map((c) => [c.userId, c]));

  const columns: Column<Member>[] = [
    {
      key: "who",
      header: "Member",
      sortValue: (m) => m.name,
      render: (m) => (
        <span className="flex items-center gap-2.5 py-1.5">
          <Avatar name={m.name} id={m.id} size="md" status={m.active ? m.availability : undefined} />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {m.name}
              {m.id === me.data?.user.id ? <span className="font-normal text-text-muted"> (you)</span> : null}
            </span>
            <span className="block truncate text-[12px] text-text-muted">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (m) => m.roleName,
      render: (m) => {
        const why = editBlock(actor, m.baseLevel);
        if (why || !m.active) {
          return (
            <span className="flex flex-col">
              <span>
                {m.roleName} <Badge>{levelLabel[m.baseLevel]}</Badge>
              </span>
              {why ? <span className="text-[12px] text-text-muted">{why}</span> : null}
            </span>
          );
        }
        const options = roleList.filter((r) => r.baseLevel !== "owner" && (actor === "owner" || r.baseLevel === "user"));
        return (
          <Select
            label={`Role for ${m.name}`}
            value={m.roleId}
            disabled={update.isPending}
            onValueChange={(roleId) =>
              update.mutate(
                { id: m.id, roleId },
                { onSuccess: () => toast(`${m.name} is now ${roleList.find((r) => r.id === roleId)?.name}`, "ok"), onError: (e) => toast(e.message, "signal") },
              )
            }
            options={options.map((r) => ({ value: r.id, label: `${r.name} (${levelLabel[r.baseLevel]})` }))}
          />
        );
      },
    },
    { key: "availability", header: "Availability", render: (m) => (m.active ? availability[m.availability] : <Badge>Deactivated</Badge>) },
    {
      key: "calendar",
      header: "Calendar",
      render: (m) => {
        const c = calBy.get(m.id);
        if (!c) return <span className="text-text-muted">–</span>;
        const [tone, label] = calendar[c.status];
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (m) => {
        if (m.id === me.data?.user.id || editBlock(actor, m.baseLevel)) return null;
        return (
          <Button
            size="sm"
            variant={m.active ? "ghost" : "quiet"}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: m.id, active: !m.active },
                {
                  onSuccess: () => toast(m.active ? `${m.name} deactivated. Leads they had not acknowledged moved to someone else.` : `${m.name} reactivated`, "ok"),
                  onError: (e) => toast(e.message, "signal"),
                },
              )
            }
          >
            {m.active ? "Deactivate" : "Reactivate"}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <Breadcrumbs items={[{ href: "/dashboard", label: "Desk" }, { label: "Team" }]} />
      <PageHeader
        title="Team"
        description="Who is on the desk, what they can do, and whether they can be booked."
        actions={allowed && roleList.length ? <InviteDialog roles={roleList} actor={actor} /> : null}
      />
      {me.isSuccess && !allowed ? (
        <EmptyState icon={Users} title="Admins only" body="You need the Manage users permission to see the team settings." />
      ) : members.isLoading || roles.isLoading || me.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : members.isError || roles.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={members.error ?? roles.error} />
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              void members.refetch();
              void roles.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Table caption="Team members" columns={columns} rows={members.data?.items ?? []} rowKey={(m) => m.id} pageSize={15} />
          {invites.data?.items.length ? (
            <Card>
              <CardHeader title="Pending invites" />
              <ul className="divide-y divide-border px-5 pb-3">
                {invites.data.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[13px]">
                    <span className="flex items-center gap-2">
                      <Avatar name={i.email} size="sm" />
                      <span>
                        <span className="block font-medium">{i.email}</span>
                        <span className="block text-[12px] text-text-muted">
                          {roleList.find((r) => r.id === i.roleId)?.name ?? "Role"} · expires {format(new Date(i.expiresAt), "d MMM")}
                        </span>
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(i.id, { onSuccess: () => toast("Invite revoked", "ok"), onError: (e) => toast(e.message, "signal") })}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <RolesMatrix roles={roleList} actor={actor} />
        </div>
      )}
    </>
  );
}
