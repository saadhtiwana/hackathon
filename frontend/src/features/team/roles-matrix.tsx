"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { levelLabel, usePermissions, useSaveRole, type BaseLevel, type Role } from "./api";

export function RolesMatrix({ roles, actor }: { roles: Role[]; actor: BaseLevel }) {
  const perms = usePermissions();
  const save = useSaveRole();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const current = (r: Role) => draft[r.id] ?? r.permissions;
  const dirty = (r: Role) => !!draft[r.id] && [...draft[r.id]].sort().join() !== [...r.permissions].sort().join();
  const lockedWhy = (r: Role) =>
    r.baseLevel === "owner" ? "The Owner always has every permission." : r.baseLevel === "admin" && actor !== "owner" ? "Only the Owner can change admin-level roles." : null;

  function toggle(r: Role, key: string, on: boolean) {
    const base = current(r);
    setDraft((d) => ({ ...d, [r.id]: on ? [...base, key] : base.filter((k) => k !== key) }));
  }

  const groups = new Map<string, { key: string; label: string }[]>();
  for (const p of perms.data?.items ?? []) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);

  return (
    <Card>
      <CardHeader title="Roles and permissions" description="Permissions are not tied to role names. Tick what each role may do, then save that role." />
      <div className="p-5">
        {perms.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : perms.isError ? (
          <Notice error={perms.error} onRetry={() => void perms.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <caption className="sr-only">Permissions per role</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 text-left font-medium text-text-muted">
                    Permission
                  </th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col" className="px-2 py-2 text-center font-medium">
                      <span className="block">{r.name}</span>
                      <span className="block text-[11px] font-normal text-text-muted">{levelLabel[r.baseLevel]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...groups].map(([group, items]) => (
                  <GroupRows key={group} group={group} items={items} roles={roles} span={roles.length + 1} current={current} lockedWhy={lockedWhy} toggle={toggle} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 text-[12px] text-text-muted">Unsaved changes stay on this page only.</td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-2 pt-3 text-center">
                      {lockedWhy(r) ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-text-muted" title={lockedWhy(r)!}>
                          <Lock className="size-3.5" aria-hidden />
                          <span className="sr-only">{lockedWhy(r)}</span>
                          Locked
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={dirty(r) ? "primary" : "quiet"}
                          disabled={!dirty(r) || (save.isPending && save.variables?.id === r.id)}
                          onClick={() =>
                            save.mutate(
                              { id: r.id, permissions: current(r) },
                              {
                                onSuccess: () => {
                                  toast(`${r.name} saved`, "ok");
                                  setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== r.id)));
                                },
                                onError: (e) => toast(`${r.name} not saved: ${e.message}`, "signal"),
                              },
                            )
                          }
                        >
                          {save.isPending && save.variables?.id === r.id ? "Saving" : "Save"}
                        </Button>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function GroupRows({
  group,
  items,
  roles,
  span,
  current,
  lockedWhy,
  toggle,
}: {
  group: string;
  items: { key: string; label: string }[];
  roles: Role[];
  span: number;
  current: (r: Role) => string[];
  lockedWhy: (r: Role) => string | null;
  toggle: (r: Role, key: string, on: boolean) => void;
}) {
  return (
    <>
      <tr>
        <th colSpan={span} scope="colgroup" className="pt-4 pb-1 text-left text-[12px] font-semibold text-text-muted">
          {group}
        </th>
      </tr>
      {items.map((p) => (
        <tr key={p.key} className="border-b border-border hover:bg-surface-hover">
          <th scope="row" className="py-2 pr-4 text-left font-normal">
            {p.label}
          </th>
          {roles.map((r) => {
            const locked = !!lockedWhy(r);
            const on = r.baseLevel === "owner" || current(r).includes(p.key);
            return (
              <td key={r.id} className="px-2 py-2 text-center">
                <Checkbox
                  checked={on}
                  disabled={locked}
                  aria-label={`${r.name}: ${p.label}`}
                  onCheckedChange={(v) => toggle(r, p.key, v === true)}
                  className={cn("mx-auto", locked && "opacity-60")}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
