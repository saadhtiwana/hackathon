import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c } from "../theme";
import { Mono } from "../ui/kit";
import { mix, prog } from "../ui/motion";
import { Words, split } from "../ui/Words";

// 0–3s: the problem, said plainly.
export function Silence() {
  const frame = useCurrentFrame();
  const lift = prog(frame, 40, 54);
  const wait = Math.floor(mix(0, 194, prog(frame, 56, 88)));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 80 }}>
      <div style={{ transform: `translateY(${-lift * 70}px) scale(${1 - lift * 0.18})`, opacity: 1 - lift * 0.62 }}>
        <Words words={split("A customer reached out.")} start={2} stagger={5} size={104} />
      </div>
      <div style={{ position: "absolute", top: "50%", width: "100%", transform: "translateY(-10px)" }}>
        <Words words={split("Nobody answered.")} start={46} stagger={7} size={124} weight={700} />
      </div>
      <div style={{ position: "absolute", bottom: 150, opacity: prog(frame, 58, 66), display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 12, height: 12, borderRadius: 99, background: c.red, opacity: frame % 20 < 12 ? 1 : 0.35 }} />
        <Mono size={26} color={c.red}>
          no reply · {Math.floor(wait / 60)}h {String(wait % 60).padStart(2, "0")}m
        </Mono>
      </div>
    </AbsoluteFill>
  );
}
