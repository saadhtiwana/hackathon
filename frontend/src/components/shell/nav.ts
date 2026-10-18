import {
  Bell,
  Building2,
  Calendar,
  Columns3,
  GitBranch,
  Inbox,
  LayoutDashboard,
  Rocket,
  ListFilter,
  LifeBuoy,
  Plug,
  ScrollText,
  Timer,
  MessageSquare,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  count?: boolean;
};

export const primaryNav: NavItem[] = [
  { href: "/get-started", label: "Get started", icon: Rocket },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Inbox, permission: "crm.view", count: true },
  { href: "/inbox", label: "Inbox", icon: MessageSquare, permission: "crm.view" },
  { href: "/pipeline", label: "Pipeline", icon: Columns3, permission: "crm.view" },
  { href: "/contacts", label: "Contacts", icon: Users, permission: "crm.view" },
  { href: "/lists", label: "Saved lists", icon: ListFilter, permission: "crm.view" },
  { href: "/companies", label: "Companies", icon: Building2, permission: "crm.view" },
  { href: "/recovery", label: "Recovery queue", icon: LifeBuoy, permission: "leads.reassign" },
  { href: "/appointments", label: "Appointments", icon: Calendar, permission: "crm.view" },
  { href: "/payments", label: "Payments", icon: Wallet, permission: "crm.view" },
];

export const settingsNav: NavItem[] = [
  { href: "/settings/users", label: "Users & roles", icon: Users, permission: "users.manage" },
  { href: "/settings/pipelines", label: "Pipelines & fields", icon: GitBranch, permission: "settings.manage" },
  { href: "/settings/assignment", label: "Assignment rules", icon: Timer, permission: "leads.manage_rules" },
  { href: "/settings/integrations", label: "Integrations", icon: Plug, permission: "integrations.manage" },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/audit", label: "Audit log", icon: ScrollText, permission: "audit.view" },
];

export const paletteItems = [...primaryNav, ...settingsNav];
