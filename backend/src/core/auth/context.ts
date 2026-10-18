import type { Permission } from '../rbac/permissions.js';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  membershipId: string;
  sessionId: string;
  roleId: string;
  baseLevel: 'owner' | 'admin' | 'user';
  permissions: Set<Permission>;
  availability: 'available' | 'busy' | 'on_leave' | 'offline';
}
