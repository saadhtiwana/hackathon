import { cn } from "@/lib/cn";

// Calm surface: soft radius, 1px border, the single raised shadow only when asked for.
export function Card({
  className,
  raised,
  interactive,
  ...props
}: React.ComponentProps<"div"> & { raised?: boolean; interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface",
        raised && "shadow-raised",
        interactive && "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raised",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
