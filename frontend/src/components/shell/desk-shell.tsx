"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, LogOut, Menu, Search } from "lucide-react";
import { api, isApiError, type Availability, type Me } from "@/lib/api";
import { apiFetch } from "@/lib/api/client";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { useMe } from "@/components/session";
import { paletteItems, primaryNav, settingsNav, type NavItem } from "@/components/shell/nav";
import { CommandPalette } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, presence } from "@/components/ui/avatar";
import { DropdownItem, DropdownMenu } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

const availabilityOptions: Availability[] = ["available", "busy", "on_leave", "offline"];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Open leads only (not closed), walking every page so the badge is never capped.
async function countOpenLeads() {
  let cursor: string | null | undefined;
  let open = 0;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: "200" });
    if (cursor) q.set("cursor", cursor);
    const res = await apiFetch<{ items: { status?: string }[]; nextCursor?: string | null }>(`/leads?${q}`);
    open += res.items.filter((l) => l.status !== "closed").length;
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return open;
}

function Brand({ name, rail }: { name: string; rail?: boolean }) {
  return (
    <Link href="/" className="mb-5 flex h-9 items-center gap-2.5 rounded-md px-2 hover:bg-surface-hover">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-[12px] font-semibold text-on-accent">
        {name.trim()[0]?.toUpperCase() ?? "R"}
      </span>
      <span className={cn("min-w-0 truncate text-[14px] font-semibold", rail && "md:sr-only lg:not-sr-only")}>{name}</span>
    </Link>
  );
}

function NavList({ me, count, rail, onNavigate }: { me: Me; count: number | null; rail?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = [
    { label: "Desk", items: primaryNav },
    { label: "Settings", items: settingsNav },
  ];

  return (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      {groups.map((group) => {
        const items = group.items.filter((item) => can(me, item.permission));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className={cn("px-2 pb-1.5 text-[12px] font-medium text-text-muted", rail && "md:sr-only lg:not-sr-only")}>{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(pathname, item.href)} count={item.count ? count : null} rail={rail} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function NavLink({ item, active, count, rail, onNavigate }: { item: NavItem; active: boolean; count: number | null; rail?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[14px]",
        rail && "md:justify-center lg:justify-start",
        active ? "bg-accent-soft font-medium text-accent-text" : "text-text-muted hover:bg-surface-hover hover:text-text",
      )}
    >
      <Icon className="size-[17px] shrink-0" aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate", rail && "md:sr-only lg:not-sr-only")}>{item.label}</span>
      {count != null && count > 0 ? (
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
            active ? "bg-accent text-on-accent" : "bg-surface-muted text-text-muted",
            rail && "md:absolute md:-top-1 md:-right-1 lg:static",
          )}
          aria-label={`${count} open`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

// Reads the route, so it renders only after the session loads (keeps prerendering static).
function CurrentTitle({ fallback }: { fallback: string }) {
  const pathname = usePathname();
  const current = [...paletteItems].sort((a, b) => b.href.length - a.href.length).find((item) => isActive(pathname, item.href));
  return <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{current?.label ?? fallback}</p>;
}

function UserCard({ me, status, rail }: { me: Me; status: Availability; rail?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg px-2 py-2", rail && "md:justify-center lg:justify-start")}>
      <Avatar name={me.user.name} id={me.user.id} size="md" status={status} />
      <span className={cn("min-w-0", rail && "md:sr-only lg:not-sr-only")}>
        <span className="block truncate text-[13px] font-medium">{me.user.name}</span>
        <span className="block truncate text-[12px] text-text-muted">{me.role.name}</span>
      </span>
    </div>
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

  const openLeads = useQuery({
    queryKey: ["leads", "open-count"],
    queryFn: countOpenLeads,
    enabled: me.isSuccess && can(me.data, "crm.view"),
    retry: false,
  });

  if (me.isLoading) {
    return (
      <div className="flex min-h-full">
        <div className="hidden w-60 border-r border-border p-3 lg:block">
          <Skeleton className="mb-6 h-8 w-32" />
          <Skeleton className="h-80 w-full" />
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="mb-3 h-9 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
    );
  }

  if (signedOut) return null;

  if (!me.data) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 px-6">
        <p className="text-[20px] font-semibold">Relay</p>
        <Notice error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }

  const session = me.data;
  const status = availability ?? session.availability;
  const count = openLeads.data ?? null;

  async function changeAvailability(value: Availability) {
    setAvailability(value);
    try {
      await api.setAvailability(value);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
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
    <div className="flex min-h-full bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[60px] shrink-0 flex-col border-r border-border bg-canvas px-2 py-3 md:flex lg:w-60 lg:px-3">
        <Brand name={session.workspace.name} rail />
        <NavList me={session} count={count} rail />
        <UserCard me={session} status={status} rail />
      </aside>
      <Sheet open={menu} onOpenChange={setMenu} title="Navigation">
        <Brand name={session.workspace.name} />
        <NavList me={session} count={count} onNavigate={() => setMenu(false)} />
        <UserCard me={session} status={status} />
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-border bg-canvas px-3 sm:px-5">
          <IconButton className="md:hidden" label="Open navigation" onClick={() => setMenu(true)}>
            <Menu className="size-[18px]" />
          </IconButton>
          <CurrentTitle fallback={session.workspace.name} />
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-text-muted hover:border-border-strong sm:inline-flex"
          >
            <Search className="size-3.5" aria-hidden />
            Search
            <Kbd>Ctrl K</Kbd>
          </button>
          <IconButton label="Search" className="sm:hidden" onClick={() => setPalette(true)}>
            <Search className="size-[18px]" />
          </IconButton>
          <DropdownMenu
            label="Set your availability"
            trigger={
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-[13px] hover:border-border-strong"
              >
                <Avatar name={session.user.name} id={session.user.id} size="sm" status={status} />
                <span className="hidden font-medium sm:inline">{presence[status].label}</span>
              </button>
            }
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-text-muted">Your availability</p>
            {availabilityOptions.map((value) => (
              <DropdownItem key={value} onSelect={() => void changeAvailability(value)} className="gap-2.5">
                <span className={cn("size-2 rounded-full", presence[value].dot)} aria-hidden />
                <span className="flex-1">{presence[value].label}</span>
                {status === value ? <Check className="size-3.5 text-accent-text" aria-label="Current" /> : null}
              </DropdownItem>
            ))}
          </DropdownMenu>
          <IconButton label="Notifications" onClick={() => router.push("/settings/notifications")}>
            <Bell className="size-[18px]" />
          </IconButton>
          <ThemeToggle />
          <DropdownMenu
            label="Account menu"
            trigger={
              <button type="button" className="rounded-full" aria-label="Account menu">
                <Avatar name={session.user.name} id={session.user.id} size="md" />
              </button>
            }
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar name={session.user.name} id={session.user.id} size="md" status={status} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{session.user.name}</span>
                <span className="block truncate text-[12px] text-text-muted">
                  {session.role.name} · {session.workspace.name}
                </span>
              </span>
            </div>
            <div className="my-1 h-px bg-border" />
            <DropdownItem onSelect={() => void signOut()}>
              <LogOut className="mr-2 size-3.5" aria-hidden />
              Sign out
            </DropdownItem>
          </DropdownMenu>
        </header>
        <main id="content" className="mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} me={session} />
    </div>
  );
}
