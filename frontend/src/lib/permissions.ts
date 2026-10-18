import type { Me } from "@/lib/api";

export function can(me: Me | undefined, permission: string | undefined) {
  if (!permission) return true;
  if (!me) return false;
  if (me.role.baseLevel === "owner") return true;
  return me.permissions.includes(permission);
}
