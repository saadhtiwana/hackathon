export function Timeline({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col">{children}</ol>;
}

export function TimelineItem({
  title,
  meta,
  body,
}: {
  title: string;
  meta: string;
  body?: string;
}) {
  return (
    <li className="relative border-l border-line py-2 pl-4">
      <span className="absolute top-3.5 -left-1 size-2 rounded-full bg-ink" aria-hidden />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="font-mono text-[12px] text-muted tabular-nums">{meta}</p>
      </div>
      {body ? <p className="mt-0.5 text-[13px] text-muted">{body}</p> : null}
    </li>
  );
}
