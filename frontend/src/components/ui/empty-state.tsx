import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 animate-fade-in">
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent-text" aria-hidden>
        <Icon className="size-5" />
      </span>
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-md text-[13px] text-text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}
