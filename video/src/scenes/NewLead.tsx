import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Avatar, Frame, Mono, Pill, Ring, Shot } from "../ui/kit";
import { Icon } from "../ui/icons";
import { easeInOut, mix, prog } from "../ui/motion";
import { Words } from "../ui/Words";

// 9–15s: an email lead lands in the Leads table, camera pushes into its countdown.
export function NewLead() {
  const frame = useCurrentFrame();
  const { width, height, sq, inner } = useStage();
  const left = (width - inner) / 2;
  const rowTop = 318;
  const rowH = 116;
  const ring = 84;
  const rowRight = left + inner + 24;
  const rx = rowRight - 32 - ring / 2;
  const ry = rowTop + rowH / 2;

  const frameIn = prog(frame, 0, 16);
  const rowIn = prog(frame, 14, 30);
  const zoom = prog(frame, 62, 92, easeInOut);
  const s = mix(1, sq ? 2.4 : 2.8, zoom);
  const secs = Math.round(interpolate(frame, [92, 168], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const out = secs === 0;
  const flash = out ? prog(frame, 168, 176) : 0;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: `${rx}px ${ry}px`,
          transform: `translate(${(width / 2 - rx) * zoom}px, ${(height / 2 - 40 - ry) * zoom}px) scale(${s})`,
        }}
      >
        <Frame style={{ left, top: 130, width: inner, height: 740, opacity: frameIn, transform: `translateY(${(1 - frameIn) * 40}px)` }}>
          <Shot name="leads" x={0} y={0} zoom={1.0 + frame * 0.0004} />
        </Frame>
        <Frame
          radius={20}
          style={{
            left: left - 24,
            top: rowTop,
            width: inner + 48,
            height: rowH,
            opacity: rowIn,
            transform: `translateY(${(1 - rowIn) * -70}px)`,
            display: "flex",
            alignItems: "center",
            gap: 28,
            padding: "0 32px",
            boxShadow: `0 0 0 ${3 * (1 - flash)}px ${out ? c.red : "transparent"}, 0 30px 70px -20px rgba(23,20,15,0.3)`,
          }}
        >
          <Avatar name="Hamza Raza" size={60} tone={0} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 600 }}>Hamza Raza</div>
            <div style={{ fontSize: 20, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Viewing for the 3-bed in DHA Phase 2</div>
          </div>
          {sq ? null : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, color: c.muted }}>
              <Icon name="mail" size={20} /> Email
            </span>
          )}
          {out ? (
            <Pill bg={c.red} fg="#fff" size={19}>
              Escalating
            </Pill>
          ) : (
            <Pill bg={c.yellowTint} fg={c.yellow} size={19}>
              Waiting for ack
            </Pill>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 20, whiteSpace: "nowrap" }}>
            <Avatar name="Ahmed Butt" size={36} tone={1} dot="#22A55B" /> Ahmed Butt
          </span>
          <Ring size={ring} stroke={7} left={secs / 30} label={`0:${String(secs).padStart(2, "0")}`} />
        </Frame>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70 }}>
        {frame < 74 ? (
          <Words words={["A", "new", "lead.", "One", "owner."]} start={22} stagger={4} size={60} weight={600} />
        ) : (
          <Words words={["Thirty", "seconds", "to", "claim", "it."]} start={92} stagger={4} size={60} weight={600} />
        )}
      </div>
      <Mono size={22} style={{ position: "absolute", top: 60, left: 0, right: 0, textAlign: "center", opacity: prog(frame, 20, 30) * (1 - zoom) }}>
        Leads · assigned the moment it arrives
      </Mono>
    </AbsoluteFill>
  );
}
