import type { CSSProperties, ReactNode } from "react";
import { Img, getStaticFiles, interpolate, staticFile, useCurrentFrame } from "remotion";
import { c, font, shadow, shadowSm } from "../theme";
import { easeInOut, prog } from "./motion";

// Floating window: white, rounded, soft shadow, hairline border.
export function Frame({ children, style, radius = 24, small }: { children?: ReactNode; style?: CSSProperties; radius?: number; small?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        background: c.card,
        borderRadius: radius,
        boxShadow: small ? shadowSm : shadow,
        border: `1px solid ${c.line}`,
        overflow: "hidden",
        fontFamily: font.sans,
        color: c.ink,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const files = new Set(getStaticFiles().map((f) => f.name));
export const hasShot = (name: string) => files.has(`shots/${name}.png`);

// A real screenshot from the live app (1440x900 at 2x). zoom/x/y pan inside the frame.
// Without the capture it falls back to a quiet skeleton so the cut still reads.
export function Shot({ name, zoom = 1, x = 50, y = 0, style }: { name: string; zoom?: number; x?: number; y?: number; style?: CSSProperties }) {
  if (!hasShot(name)) {
    return (
      <div style={{ position: "absolute", inset: 0, background: "#FBFBFA", padding: 40, display: "flex", flexDirection: "column", gap: 18, ...style }}>
        <div style={{ height: 22, width: "28%", background: c.soft, borderRadius: 8 }} />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ height: 44, width: `${92 - (i % 3) * 9}%`, background: "#F3F1EC", borderRadius: 10 }} />
        ))}
      </div>
    );
  }
  return (
    <Img
      src={staticFile(`shots/${name}.png`)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `${x}% ${y}%`,
        transform: `scale(${zoom})`,
        transformOrigin: `${x}% ${y}%`,
        ...style,
      }}
    />
  );
}

const tints = [
  [c.blueTint, c.blue],
  [c.pinkTint, c.pink],
  [c.greenTint, c.green],
  [c.yellowTint, c.yellow],
  ["#EFEDE7", "#3D3A33"],
] as const;

export function Avatar({ name, size = 56, tone = 0, ring, dot }: { name: string; size?: number; tone?: number; ring?: string; dot?: string }) {
  const [bg, fg] = tints[tone % tints.length];
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size,
          background: bg,
          color: fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.sans,
          fontWeight: 600,
          fontSize: size * 0.36,
          boxShadow: ring ? `0 0 0 ${Math.max(3, size / 16)}px ${ring}` : undefined,
        }}
      >
        {initials}
      </div>
      {dot ? (
        <div style={{ position: "absolute", right: 0, bottom: 0, width: size * 0.28, height: size * 0.28, borderRadius: 99, background: dot, border: `${Math.max(2, size / 22)}px solid #fff` }} />
      ) : null}
    </div>
  );
}

export function Pill({ children, bg, fg, size = 18, style }: { children: ReactNode; bg: string; fg: string; size?: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.4,
        background: bg,
        color: fg,
        fontFamily: font.sans,
        fontWeight: 500,
        fontSize: size,
        padding: `${size * 0.28}px ${size * 0.7}px`,
        borderRadius: 99,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Acknowledgement countdown ring, like the one in the leads table. left = 0..1 of the window remaining.
export function Ring({ size, left, label, stroke = 10, tone }: { size: number; left: number; label: string; stroke?: number; tone?: string }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const urgent = left <= 0.34;
  const color = tone ?? (urgent ? c.red : c.ink);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c.soft} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - left)} />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.mono,
          fontWeight: 500,
          fontSize: size * 0.27,
          color,
          letterSpacing: "-0.02em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

type Point = { f: number; x: number; y: number };

// Arrow cursor gliding between keyframes; clicks dip the arrow and leave a ripple.
export function Cursor({ path, clicks = [] }: { path: Point[]; clicks?: number[] }) {
  const frame = useCurrentFrame();
  let x = path[0].x;
  let y = path[0].y;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (frame >= a.f) {
      const t = prog(frame, a.f, b.f, easeInOut);
      x = a.x + (b.x - a.x) * t;
      y = a.y + (b.y - a.y) * t;
    }
  }
  const visible = prog(frame, path[0].f - 8, path[0].f);
  let press = 0;
  let ripple: { p: number } | null = null;
  for (const k of clicks) {
    press = Math.max(press, interpolate(frame, [k - 3, k, k + 5], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    if (frame >= k && frame < k + 18) ripple = { p: prog(frame, k, k + 18) };
  }
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: visible, pointerEvents: "none", zIndex: 50 }}>
      {ripple ? (
        <div
          style={{
            position: "absolute",
            left: -28,
            top: -28,
            width: 56,
            height: 56,
            borderRadius: 99,
            border: `3px solid ${c.ink}`,
            opacity: 0.5 * (1 - ripple.p),
            transform: `scale(${0.3 + ripple.p})`,
          }}
        />
      ) : null}
      <svg width={34} height={40} viewBox="0 0 34 40" style={{ transform: `scale(${1 - press * 0.16})`, transformOrigin: "4px 4px", filter: "drop-shadow(0 6px 10px rgba(23,20,15,0.28))" }}>
        <path d="M4 3 L4 33 L12 25.5 L17.5 37 L23 34.5 L17.6 23 L28.5 23 Z" fill={c.ink} stroke="#fff" strokeWidth={2.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// The current Relay mark (public/brand/relay-mark.png, the file the app and README use), never redrawn.
// The reveal splits that one image into three clipped layers so it can build as a handoff:
// t: 0 → 1 brings in the first stroke, the second takes over from it, then the dot lands.
const MARK = staticFile("brand/relay-mark.png");
const parts = [
  "polygon(0% 0%, 73.2% 0%, 73.2% 34.2%, 32.2% 34.2%, 32.2% 100%, 0% 100%)",
  "polygon(32.2% 34.2%, 100% 34.2%, 100% 100%, 32.2% 100%)",
  "circle(10.6% at 84.4% 23.8%)",
];

export function LogoMark({ size, t = 1, tileT = 1 }: { size: number; t?: number; tileT?: number }) {
  const a = Math.min(1, t * 1.6);
  const b = Math.max(0, Math.min(1, (t - 0.3) / 0.7));
  const d = Math.max(0, Math.min(1, (t - 0.75) / 0.25));
  const layer = [
    { opacity: a, transform: `translateY(${(1 - a) * 22}%)` },
    { opacity: b, transform: `translateX(${(1 - b) * -26}%)` },
    { opacity: d, transform: `scale(${0.4 + 0.6 * d})`, transformOrigin: "84.4% 23.8%" },
  ];
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, transform: `scale(${0.7 + 0.3 * tileT})`, opacity: tileT }}>
      {parts.map((clip, i) => (
        <Img key={i} src={MARK} style={{ position: "absolute", inset: 0, width: size, height: size, clipPath: clip, ...layer[i] }} />
      ))}
    </div>
  );
}

export function Mono({ children, size = 18, color = c.muted, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return <span style={{ fontFamily: font.mono, fontSize: size, color, letterSpacing: "-0.01em", ...style }}>{children}</span>;
}
