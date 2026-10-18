import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export type PresenceStatus = "available" | "busy" | "on_leave" | "offline";

const sizes = { xs: 20, sm: 24, md: 32, lg: 44 } as const;
type SizeName = keyof typeof sizes;

const tints = ["bg-tint-violet", "bg-tint-blue", "bg-tint-green", "bg-tint-yellow", "bg-tint-pink"];

export const presence: Record<PresenceStatus, { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-status-available" },
  busy: { label: "Busy", dot: "bg-status-busy" },
  on_leave: { label: "On leave", dot: "bg-status-away" },
  offline: { label: "Offline", dot: "bg-status-offline" },
};

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// Generated locally from the seed, so avatars work offline and never call an external service.
const cache = new Map<string, string | null>();
function portrait(seed: string) {
  if (!cache.has(seed)) {
    try {
      cache.set(seed, createAvatar(notionists, { seed, size: 64 }).toDataUri());
    } catch {
      cache.set(seed, null);
    }
  }
  return cache.get(seed) ?? null;
}

export function Avatar({
  name,
  id,
  size = "sm",
  status,
  className,
}: {
  name: string;
  /** stable seed, usually the user id; falls back to the name */
  id?: string;
  size?: SizeName | number;
  status?: PresenceStatus;
  className?: string;
}) {
  const px = typeof size === "number" ? size : sizes[size];
  const seed = id || name || "?";
  const src = portrait(seed);
  const dot = Math.max(6, Math.round(px * 0.28));

  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: px, height: px }}>
      <span
        aria-hidden
        className={cn(
          "inline-flex size-full items-center justify-center overflow-hidden rounded-full font-medium text-tint-violet-text",
          tints[hash(seed) % tints.length],
        )}
        style={{ fontSize: Math.round(px * 0.4) }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- inline data URI, nothing to optimise
          <img src={src} alt="" width={px} height={px} className="size-full" draggable={false} />
        ) : (
          initials(name)
        )}
      </span>
      {status ? (
        <>
          <span
            aria-hidden
            className={cn("absolute right-0 bottom-0 rounded-full ring-2 ring-surface", presence[status].dot)}
            style={{ width: dot, height: dot }}
          />
          <span className="sr-only">{presence[status].label}</span>
        </>
      ) : null}
    </span>
  );
}

export function AvatarGroup({
  people,
  max = 4,
  size = "sm",
  label,
}: {
  people: { id?: string; name: string; status?: PresenceStatus }[];
  max?: number;
  size?: SizeName;
  label?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const px = sizes[size];
  return (
    <span className="inline-flex items-center" role="group" aria-label={label ?? people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <span key={p.id ?? p.name} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-1.5")} title={p.name}>
          <Avatar name={p.name} id={p.id} size={size} status={p.status} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-muted font-medium text-text-muted ring-2 ring-surface tabular-nums"
          style={{ width: px, height: px, fontSize: Math.round(px * 0.38) }}
          aria-label={`${rest} more`}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
