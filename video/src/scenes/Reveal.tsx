import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c, font } from "../theme";
import { LogoMark } from "../ui/kit";
import { prog } from "../ui/motion";
import { Words } from "../ui/Words";

// 6–9s: the mark builds as a baton handoff, then the promise.
export function Reveal() {
  const frame = useCurrentFrame();
  const tile = prog(frame, 0, 12);
  const pass = prog(frame, 6, 34);
  const slide = prog(frame, 34, 50);
  const word = prog(frame, 40, 54);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36 * slide, transform: `translateY(${-slide * 60}px)` }}>
        <LogoMark size={200 - slide * 60} t={pass} tileT={tile} />
        <div style={{ width: 280 * word, overflow: "hidden" }}>
          <div
            style={{
              fontFamily: font.sans,
              fontSize: 128,
              fontWeight: 600,
              letterSpacing: "-0.045em",
              lineHeight: 1,
              color: c.ink,
              opacity: word,
              transform: `translateX(${(1 - word) * -40}px)`,
            }}
          >
            relay
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: "58%", width: "100%" }}>
        <Words words={["Every", "lead", "has", "an", "owner."]} start={50} stagger={4} size={64} weight={500} color={c.ink} />
      </div>
    </AbsoluteFill>
  );
}
