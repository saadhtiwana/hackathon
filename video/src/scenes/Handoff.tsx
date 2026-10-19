import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Avatar, Frame, Mono, Pill, Shot } from "../ui/kit";
import { Icon } from "../ui/icons";
import { easeInOut, mix, prog } from "../ui/motion";

const people = [
  { name: "Sara Ahmed", role: "Agent", tone: 1 },
  { name: "Usman Tariq", role: "Agent", tone: 2 },
  { name: "Imran Qureshi", role: "Manager", tone: 3 },
];

const chain = [
  { title: "Assigned to Sara Ahmed", note: "first in rotation", at: "14:02:10" },
  { title: "Escalated to Usman Tariq", note: "level 1 · window expired", at: "14:02:40" },
  { title: "Escalated to Imran Qureshi", note: "level 2 · manager", at: "14:03:10" },
];

// 15–21s: the lead moves hand to hand while the custody chain writes itself.
export function Handoff() {
  const frame = useCurrentFrame();
  const { width, sq, inner } = useStage();
  const x0 = (width - inner) / 2;
  const rowW = sq ? inner : 820;
  const gap = (rowW - 200) / 2;
  const cx = (i: number) => x0 + 100 + i * gap;
  const ay = sq ? 150 : 200;
  const hop1 = prog(frame, 26, 46, easeInOut);
  const hop2 = prog(frame, 64, 84, easeInOut);
  const holder = hop2 >= 1 ? 2 : hop1 >= 1 ? 1 : 0;
  const tokenX = cx(0) + mix(mix(0, gap, hop1), gap * 2, hop2);
  const tokenLift = Math.sin(hop1 * Math.PI) * 50 + Math.sin(hop2 * Math.PI) * 50;

  const chainLeft = x0;
  const chainTop = sq ? 380 : 420;
  const chainW = sq ? 600 : 820;
  const mailIn = prog(frame, 96, 112);

  return (
    <AbsoluteFill>
      {sq ? null : (
        <Frame style={{ left: x0 + 900, top: 130, width: 700, height: 520, opacity: prog(frame, 0, 14), transform: `translateY(${(1 - prog(frame, 0, 14)) * 30}px)` }}>
          <Shot name="lead-detail" x={100} y={0} zoom={1.02 + frame * 0.0006} />
        </Frame>
      )}

      {/* the relay line */}
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={width} height={400}>
        {[0, 1].map((i) => {
          const len = gap - 120;
          const drawn = i === 0 ? prog(frame, 10, 30) : prog(frame, 48, 68);
          return (
            <line
              key={i}
              x1={cx(i) + 60}
              x2={cx(i) + 60 + len}
              y1={ay + 50}
              y2={ay + 50}
              stroke={c.ink}
              strokeOpacity={0.25}
              strokeWidth={3}
              strokeDasharray={len}
              strokeDashoffset={len * (1 - drawn)}
            />
          );
        })}
      </svg>
      {people.map((p, i) => {
        const t = prog(frame, i * 6, i * 6 + 14);
        const passed = i < holder;
        return (
          <div key={p.name} style={{ position: "absolute", left: cx(i) - 100, top: ay, width: 200, display: "flex", flexDirection: "column", alignItems: "center", opacity: t, transform: `scale(${0.9 + 0.1 * t})` }}>
            <Avatar name={p.name} size={100} tone={p.tone} ring={i === holder ? c.ink : undefined} />
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 14 }}>{p.name}</div>
            <div style={{ fontSize: 18, color: c.muted }}>{p.role}</div>
            <Mono size={17} color={c.red} style={{ marginTop: 6, opacity: passed ? prog(frame, i === 0 ? 24 : 62, i === 0 ? 30 : 68) : 0 }}>
              0:00 · passed on
            </Mono>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: tokenX - 80, top: ay - 34 - tokenLift, opacity: prog(frame, 12, 20) }}>
        <Pill bg={c.ink} fg="#fff" size={18} style={{ boxShadow: "0 10px 24px -8px rgba(23,20,15,0.45)" }}>
          <Icon name="mail" size={16} /> Hamza Raza
        </Pill>
      </div>

      <Frame radius={22} style={{ left: chainLeft, top: chainTop, width: chainW, padding: "30px 36px", opacity: prog(frame, 8, 20) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 26, fontWeight: 600 }}>Custody chain</div>
          <Mono size={17}>one owner at a time</Mono>
        </div>
        <div style={{ position: "relative", paddingLeft: 40 }}>
          <div style={{ position: "absolute", left: 11, top: 12, width: 2, background: c.line, height: `${mix(0, 74, prog(frame, 20, 90))}%` }} />
          {chain.map((row, i) => {
            const at = [16, 48, 86][i];
            const t = prog(frame, at, at + 14);
            return (
              <div key={row.title} style={{ position: "relative", marginBottom: i < 2 ? 26 : 0, opacity: t, transform: `translateX(${(1 - t) * -20}px)` }}>
                <div style={{ position: "absolute", left: -38, top: 6, width: 20, height: 20, borderRadius: 99, background: i === 2 ? c.ink : "#fff", border: `2px solid ${i === 0 ? c.ink : i === 1 ? c.red : c.ink}` }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
                  <div style={{ fontSize: 23, fontWeight: 500 }}>{row.title}</div>
                  <Mono size={18}>{row.at}</Mono>
                </div>
                <div style={{ fontSize: 19, color: i === 1 ? c.red : c.muted, marginTop: 2 }}>{row.note}</div>
              </div>
            );
          })}
        </div>
      </Frame>

      <Frame
        radius={22}
        style={{
          left: sq ? x0 + inner - 640 : x0 + inner - 640,
          top: sq ? 640 : 610,
          width: 640,
          padding: "26px 30px",
          opacity: mailIn,
          transform: `translateY(${(1 - mailIn) * 60}px) scale(${0.94 + 0.06 * mailIn})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: c.pinkTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="mail" size={22} color={c.red} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, color: c.muted }}>To Imran Qureshi · via Gmail</div>
            <div style={{ fontSize: 23, fontWeight: 600 }}>Escalated to you: Hamza Raza</div>
          </div>
          <Mono size={17}>now</Mono>
        </div>
        <div style={{ fontSize: 20, color: c.muted, marginTop: 16, lineHeight: 1.4 }}>Nobody acknowledged this lead in time. It is yours now, and the clock has restarted.</div>
        <div style={{ marginTop: 18, display: "inline-flex", background: c.ink, color: "#fff", fontSize: 18, fontWeight: 500, padding: "10px 18px", borderRadius: 12 }}>Open lead</div>
      </Frame>
    </AbsoluteFill>
  );
}
