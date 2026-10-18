export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[14px] text-text-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}
