import { initials } from "@/lib/format";

export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-7 items-center justify-center rounded-sm border border-line bg-paper font-mono text-[11px]"
    >
      {initials(name)}
    </span>
  );
}
