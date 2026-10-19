import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Frame, Mono, Ring } from "../ui/kit";
import { Icon } from "../ui/icons";
import { prog } from "../ui/motion";
import { Words } from "../ui/Words";

// Frame numbers the sound cues in Launch.tsx line up with.
export const COLD = { card: 3, drainFrom: 12, zero: 57, stack: [62, 66, 70, 74] };

const behind = [
  { title: "3-bed flat, F-11 Markaz", who: "Omar Farooq · WhatsApp" },
  { title: "Plot file, Bahria Phase 8", who: "Sana Javed · Email" },
  { title: "Office floor, Blue Area", who: "Ali Hassan · Web form" },
  { title: "5 Marla house, G-13", who: "Fahad Mir · WhatsApp" },
];

function Enquiry({ title, who, ago, width }: { title: string; who: string; ago: string; width: number }) {
  return (
    <Frame radius={24} style={{ position: "relative", width, padding: "30px 34px", display: "flex", gap: 22, alignItems: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: c.soft, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="globe" size={30} color={c.ink} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Mono size={18} style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
          New enquiry · {ago}
        </Mono>
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 4, whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 22, color: c.muted, marginTop: 2 }}>{who}</div>
      </div>
    </Frame>
  );
}

// 0–3s: one enquiry, thirty seconds, nobody. The clock races out, the card is stamped Missed, more pile up behind it.
export function ColdOpen() {
  const frame = useCurrentFrame();
  const { sq } = useStage();
  const width = sq ? 820 : 860;

  const pop = interpolate(frame, [COLD.card, COLD.card + 6, COLD.card + 11], [0.86, 1.03, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardIn = prog(frame, COLD.card, COLD.card + 8);
  const drain = interpolate(frame, [COLD.drainFrom, COLD.zero], [0, 1], { easing: Easing.in(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = Math.ceil(30 * (1 - drain) - 1e-6);
  const missed = frame >= COLD.zero;
  const since = frame - COLD.zero;
  const shake = missed ? Math.sin(since * 2.4) * 14 * Math.exp(-since / 4) : 0;
  const grey = prog(frame, COLD.zero, COLD.zero + 8);
  const stamp = interpolate(frame, [COLD.zero + 2, COLD.zero + 7, COLD.zero + 11], [1.6, 0.94, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringOut = prog(frame, COLD.zero + 4, COLD.zero + 12);
  const ringTone = interpolateColors(drain, [0, 0.45, 0.75], [c.ink, c.ink, c.red]);

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 330, width, height: 190 }}>
        {behind.map((b, i) => {
          const t = prog(frame, COLD.stack[i], COLD.stack[i] + 8);
          const depth = i + 1;
          return (
            <div
              key={b.title}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                zIndex: 10 - i,
                opacity: t,
                transform: `translateY(${-depth * 30 * t}px) scale(${1 - depth * 0.045})`,
                filter: `blur(${1.5 + i * 1.2}px) grayscale(0.6)`,
              }}
            >
              <Enquiry title={b.title} who={b.who} ago={`${(i + 1) * 4}m ago`} width={width} />
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 0, top: 0, zIndex: 20, opacity: cardIn, transform: `translateX(${shake}px) translateY(${(1 - cardIn) * 50}px) scale(${pop})` }}>
          <div style={{ position: "relative", filter: `grayscale(${grey})` }}>
            <Enquiry title="10 Marla house, DHA" who="Zainab Noor · “Is it still available? Can I see it this week?”" ago="just now" width={width} />
            <div style={{ position: "absolute", inset: 0, borderRadius: 24, background: c.paper, opacity: grey * 0.5 }} />
          </div>
          {missed ? (
            <div
              style={{
                position: "absolute",
                right: 36,
                top: 42,
                transform: `rotate(-7deg) scale(${stamp})`,
                border: `5px solid ${c.red}`,
                color: c.red,
                borderRadius: 14,
                padding: "6px 22px",
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                background: "rgba(244,241,234,0.92)",
              }}
            >
              Missed.
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ position: "absolute", top: 590, opacity: prog(frame, 6, 12) * (1 - ringOut), transform: `scale(${1 - ringOut * 0.2})` }}>
        <Ring size={170} stroke={11} left={1 - drain} label={`0:${String(secs).padStart(2, "0")}`} tone={ringTone} />
      </div>
      <div style={{ position: "absolute", top: 680, width: "100%" }}>
        <Words words={["Nobody", "answered."]} start={COLD.zero + 9} stagger={5} size={sq ? 104 : 112} weight={700} />
      </div>
    </AbsoluteFill>
  );
}
