export const PERMISSIONS = [
  { key: 'crm.view', label: 'View CRM records', group: 'CRM' },
  { key: 'crm.create', label: 'Create CRM records', group: 'CRM' },
  { key: 'crm.edit', label: 'Edit CRM records', group: 'CRM' },
  { key: 'crm.delete', label: 'Delete CRM records', group: 'CRM' },
  { key: 'crm.export', label: 'Export CRM records', group: 'CRM' },
  { key: 'crm.view_values', label: 'See opportunity values', group: 'CRM' },
  { key: 'leads.reassign', label: 'Reassign leads and see all leads', group: 'Leads' },
  { key: 'leads.manage_rules', label: 'Manage assignment rules', group: 'Leads' },
  { key: 'settings.manage', label: 'Manage workspace settings, pipelines and fields', group: 'Settings' },
  { key: 'users.manage', label: 'Manage users, invites and roles', group: 'Settings' },
  { key: 'integrations.manage', label: 'Manage integrations', group: 'Settings' },
  { key: 'audit.view', label: 'View the audit log', group: 'Settings' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);
export const isPermission = (k: string): k is Permission => (ALL_PERMISSIONS as string[]).includes(k);

export const USER_PERMISSIONS: Permission[] = ['crm.view', 'crm.create', 'crm.edit'];
