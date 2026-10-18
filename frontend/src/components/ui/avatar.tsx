import { initials } from "@/lib/format";

function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const h = hue(name);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `hsl(${h} 70% 92%)`,
        color: `hsl(${h} 55% 30%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
