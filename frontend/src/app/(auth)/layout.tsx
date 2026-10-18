import { RelayMark } from "@/components/brand/relay-mark";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="content" className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px] animate-fade-in">
        <p className="mb-8 flex items-center justify-center gap-2.5">
          <RelayMark size={32} />
          <span className="text-[19px] leading-none font-semibold tracking-[-0.02em] lowercase">relay</span>
        </p>
        <div className="rounded-xl border border-border bg-surface p-7 shadow-raised sm:p-8">{children}</div>
      </div>
    </main>
  );
}
