export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="content" className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px] animate-fade-in">
        <p className="mb-8 flex items-center justify-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-[13px] text-on-accent" aria-hidden>
            R
          </span>
          Relay
        </p>
        <div className="rounded-xl border border-border bg-surface p-7 shadow-raised sm:p-8">{children}</div>
      </div>
    </main>
  );
}
