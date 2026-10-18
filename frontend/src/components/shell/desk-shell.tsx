"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Search } from "lucide-react";
import { api, isApiError, type Availability, type Me } from "@/lib/api";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { useMe } from "@/components/session";
import { primaryNav, settingsNav, type NavItem } from "@/components/shell/nav";
import { CommandPalette } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownItem, DropdownMenu } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

const availabilityOptions: { value: Availability; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "on_leave", label: "On leave" },
  { value: "offline", label: "Offline" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({
  me,
  count,
  onNavigate,
}: {
  me: Me;
  count: number | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = [
    { label: "Desk", items: primaryNav },
    { label: "Settings", items: settingsNav },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {groups.map((group) => {
        const items = group.items.filter((item) => can(me, item.permission));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{group.label}</p>
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={isActive(pathname, item.href)}
                    count={item.count ? count : null}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function NavLink({
  item,
  active,
  count,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count: number | null;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md px-2 text-[13px]",
        active ? "bg-surface text-ink" : "text-muted hover:bg-surface hover:text-ink",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count != null && count > 0 ? (
        <Badge tone={count > 0 ? "neutral" : "neutral"}>{count}</Badge>
      ) : null}
    </Link>
  );
}

export function DeskShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const signedOut = me.isError && isApiError(me.error) && me.error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [router, signedOut]);

  const leads = useQuery({
    queryKey: ["leads", "open-count"],
    queryFn: () => api.leads("?limit=50"),
    enabled: me.isSuccess && can(me.data, "crm.view"),
    retry: false,
  });

  if (me.isLoading) {
    return (
      <div className="flex min-h-full">
        <div className="hidden w-56 border-r border-line p-3 md:block">
          <Skeleton className="mb-4 h-6 w-20" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-40" />
        </div>
      </div>
    );
  }

  if (signedOut) return null;

  if (!me.data) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 px-6">
        <p className="font-mono text-[20px]">Relay</p>
        <Notice error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }

  const session = me.data;
  const status = availability ?? session.availability;
  const count = leads.data ? leads.data.items.length : null;

  async function changeAvailability(next: string) {
    const value = next as Availability;
    setAvailability(value);
    try {
      await api.setAvailability(value);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch {
      setAvailability(session.availability);
    }
  }

  async function signOut() {
    await api.logout();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-paper p-3 md:flex">
        <Link href="/" className="mb-4 px-2 font-mono text-[16px] tracking-tight">
          Relay
        </Link>
        <NavList me={session} count={count} />
      </aside>
      <Sheet open={menu} onOpenChange={setMenu} title="Navigation">
        <Link href="/" className="mb-4 px-2 font-mono text-[16px]" onClick={() => setMenu(false)}>
          Relay
        </Link>
        <NavList me={session} count={count} onNavigate={() => setMenu(false)} />
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-paper px-3">
          <IconButton className="md:hidden" label="Open navigation" onClick={() => setMenu(true)}>
            <Menu className="size-4" />
          </IconButton>
          <p className="min-w-0 flex-1 truncate text-[13px]">{session.workspace.name}</p>
          <Select
            label="Availability"
            value={status}
            onValueChange={(value) => void changeAvailability(value)}
            options={availabilityOptions}
          />
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-9 items-center gap-2 rounded-md border border-line bg-surface px-2 text-[13px] text-muted sm:inline-flex"
          >
            <Search className="size-3.5" aria-hidden />
            Search
            <Kbd>Ctrl K</Kbd>
          </button>
          <ThemeToggle />
          <DropdownMenu
            label="Account menu"
            trigger={
              <button type="button" className="rounded-sm" aria-label="Account menu">
                <Avatar name={session.user.name} />
              </button>
            }
          >
            <div className="px-2 py-2">
              <p className="text-[13px]">{session.user.name}</p>
              <p className="text-[12px] text-muted">{session.role.name}</p>
            </div>
            <DropdownItem onSelect={() => void signOut()}>
              <LogOut className="mr-2 size-3.5" aria-hidden />
              Sign out
            </DropdownItem>
          </DropdownMenu>
        </header>
        <main id="content" className="min-w-0 flex-1 px-4 py-5 md:px-6">
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} me={session} />
    </div>
  );
}
