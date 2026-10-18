export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-sm border border-line bg-paper px-1.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}
