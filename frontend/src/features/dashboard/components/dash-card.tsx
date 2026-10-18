import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

export function DashCard({
  title,
  href,
  action,
  className,
  children,
}: {
  title: string;
  href?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex min-w-0 flex-col rounded-[22px] bg-[var(--dash-card)] p-5 shadow-[var(--dash-shadow)] animate-fade-in sm:p-6", className)}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
        <span className="flex items-center gap-2">
          {action}
          {href ? <CornerLink href={href} label={`Open ${title}`} /> : null}
        </span>
      </header>
      {children}
    </section>
  );
}

export function CornerLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-[var(--dash-card)] text-text-muted hover:border-border-strong hover:text-text"
    >
      <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );
}

export function RoundButton({ label, onClick, children, href }: { label: string; onClick?: () => void; children: React.ReactNode; href?: string }) {
  const cls = "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--dash-card)] text-text-muted hover:border-border-strong hover:text-text";
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function CardState({ query, height = "h-40", children }: { query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; height?: string; children: React.ReactNode }) {
  if (query.isLoading) return <Skeleton className={cn("w-full rounded-2xl", height)} />;
  if (query.isError)
    return (
      <div className="flex flex-col items-start gap-2">
        <Notice error={query.error} />
        <Button size="sm" variant="quiet" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  return <>{children}</>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-[var(--dash-card)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-full px-4 text-[13px] font-medium whitespace-nowrap",
            value === o.value ? "bg-text text-canvas" : "text-text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
