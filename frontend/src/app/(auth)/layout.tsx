import { Lockup } from "@/components/brand/logo";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="content" className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px] animate-fade-in">
        <p className="mb-8 flex justify-center"><Lockup size={32} /></p>
        <div className="rounded-xl border border-border bg-surface p-7 shadow-raised sm:p-8">{children}</div>
      </div>
    </main>
  );
}
