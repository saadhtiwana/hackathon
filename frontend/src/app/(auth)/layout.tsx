import Link from "next/link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="px-6 pt-8">
        <Link href="/login" className="font-mono text-[28px] tracking-tight">
          Relay
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
