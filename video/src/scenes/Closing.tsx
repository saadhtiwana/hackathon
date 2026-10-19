import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Frame, LogoMark, Mono, Shot } from "../ui/kit";
import { prog } from "../ui/motion";
import { Words } from "../ui/Words";

const stack = ["Next.js", "Node", "Postgres", "Stripe", "Google Calendar", "Gmail"];
const reel = ["pipeline", "booking", "inbox", "payment-paid", "integrations", "dashboard"];

// 35–40s: how it was made, then the mark and the address.
export function Closing() {
  const frame = useCurrentFrame();
  const { sq, width } = useStage();
  const end = frame >= 96;
  if (end) {
    const t = prog(frame, 96, 112);
    const url = prog(frame, 108, 120);
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, opacity: t, transform: `scale(${0.94 + 0.06 * t})` }}>
          <LogoMark size={140} t={1} />
          <div style={{ fontSize: 132, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1 }}>relay</div>
        </div>
        <Mono size={34} color={c.ink} style={{ marginTop: 44, opacity: url, transform: `translateY(${(1 - url) * 12}px)` }}>
          relay-nascon.vercel.app
        </Mono>
      </AbsoluteFill>
    );
  }
  const w = sq ? 460 : 560;
  const h = w * 0.625;
  const drift = frame * 3.2;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: sq ? 150 : 140, left: 0, right: 0 }}>
        <Words words={["Built", "in", "one", "day", "at", "NASCON."]} start={0} stagger={4} size={sq ? 68 : 92} weight={700} />
      </div>
      <div style={{ position: "absolute", top: sq ? 330 : 330, left: 0, right: 0, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 14, padding: "0 60px" }}>
        {stack.map((s, i) => {
          const t = prog(frame, 30 + i * 4, 42 + i * 4);
          return (
            <span
              key={s}
              style={{
                opacity: t,
                transform: `translateY(${(1 - t) * 20}px)`,
                border: `1.5px solid ${c.ink}`,
                borderRadius: 99,
                padding: "10px 22px",
                fontSize: 24,
                fontWeight: 500,
                background: c.card,
              }}
            >
              {s}
            </span>
          );
        })}
      </div>
      {reel.map((name, i) => {
        const t = prog(frame, 6 + i * 3, 22 + i * 3);
        const x = (sq ? 40 : 60) + i * (w + 36) - drift;
        if (x > width) return null;
        return (
          <Frame key={name} radius={18} small style={{ left: x, top: sq ? 560 : 520, width: w, height: h, opacity: t, transform: `translateY(${(1 - t) * 40}px) rotate(${i % 2 ? 0.8 : -0.8}deg)` }}>
            <Shot name={name} x={50} y={0} />
          </Frame>
        );
      })}
    </AbsoluteFill>
  );
}
