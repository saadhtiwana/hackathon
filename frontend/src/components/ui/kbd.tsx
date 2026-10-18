export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-[5px] border border-border bg-surface-muted px-1.5 text-[11px] font-medium text-text-muted tabular-nums">
      {children}
    </kbd>
  );
}
