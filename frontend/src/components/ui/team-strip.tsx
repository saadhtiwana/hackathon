import { Avatar, presence, type PresenceStatus } from "@/components/ui/avatar";

// Presence bar: who is on the desk right now.
export function TeamStrip({
  people,
  label = "Team availability",
}: {
  people: { id: string; name: string; status: PresenceStatus; detail?: string }[];
  label?: string;
}) {
  return (
    <ul className="flex gap-5 overflow-x-auto pb-1" aria-label={label}>
      {people.map((p) => (
        <li key={p.id} className="flex shrink-0 items-center gap-2.5">
          <Avatar name={p.name} id={p.id} size="md" status={p.status} />
          <span className="min-w-0">
            <span className="block text-[13px] leading-tight font-medium">{p.name}</span>
            <span className="block text-[12px] text-text-muted">{p.detail ?? presence[p.status].label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
