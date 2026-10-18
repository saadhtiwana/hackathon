import { cn } from "@/lib/cn";

export function Timeline({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col">{children}</ol>;
}

export function TimelineItem({
  title,
  meta,
  body,
  avatar,
  current,
}: {
  title: string;
  meta: string;
  body?: React.ReactNode;
  /** shown instead of the dot, e.g. the person who held it */
  avatar?: React.ReactNode;
  current?: boolean;
}) {
  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0 animate-row-in">
      <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border group-last:hidden" aria-hidden />
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center">
        {avatar ?? <span className={cn("size-2.5 rounded-full ring-4 ring-accent-soft", current ? "bg-accent" : "bg-border-strong")} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[14px] font-medium">{title}</p>
          <p className="text-[12px] text-text-muted tabular-nums">{meta}</p>
        </div>
        {body ? <div className={cn("mt-0.5 text-[13px]", current ? "text-accent-text" : "text-text-muted")}>{body}</div> : null}
      </div>
    </li>
  );
}
