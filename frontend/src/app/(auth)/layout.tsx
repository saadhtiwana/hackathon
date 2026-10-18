import Link from "next/link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full items-center justify-center bg-wash px-4 py-12">
      <div className="w-full max-w-[400px]">
        <Link href="/login" className="mb-6 flex items-center justify-center gap-2 text-[15px] font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-[12px] text-on-accent">R</span>
          Relay
        </Link>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-float">{children}</div>
      </div>
    </div>
  );
}
