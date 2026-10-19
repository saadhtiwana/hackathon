import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Avatar, Frame, Mono, Shot } from "../ui/kit";
import { prog } from "../ui/motion";
import { Words } from "../ui/Words";

const rows = [
  { at: "14:02:09", who: "System", tone: 4, what: "Lead created from email", tag: "lead.created" },
  { at: "14:02:10", who: "Sara Ahmed", tone: 1, what: "Assigned by rotation", tag: "lead.assigned" },
  { at: "14:02:40", who: "System", tone: 4, what: "Escalated, window expired", tag: "lead.escalated" },
  { at: "14:03:10", who: "System", tone: 4, what: "Escalated to manager", tag: "lead.escalated" },
  { at: "14:03:16", who: "Imran Qureshi", tone: 3, what: "Acknowledged lead", tag: "lead.acknowledged" },
  { at: "14:04:02", who: "Imran Qureshi", tone: 3, what: "Booked viewing, Thu 4 pm", tag: "appointment.booked" },
  { at: "14:04:30", who: "Imran Qureshi", tone: 3, what: "Requested PKR 50,000", tag: "payment.requested" },
  { at: "14:06:51", who: "Stripe", tone: 2, what: "Payment succeeded", tag: "payment.paid" },
];

// 31–35s: the audit log fills in, row by row.
export function Audit() {
  const frame = useCurrentFrame();
  const { sq, inner, width } = useStage();
  const x0 = (width - inner) / 2;
  const card = sq ? { left: x0, top: 330, width: inner } : { left: x0 + 640, top: 120, width: inner - 640 };
  return (
    <AbsoluteFill>
      {sq ? null : (
        <Frame style={{ left: card.left + 120, top: 70, width: card.width - 60, height: 560, opacity: 0.9 * prog(frame, 0, 12), transform: "rotate(1.2deg)" }}>
          <Shot name="audit" x={50} y={0} />
        </Frame>
      )}
      <Frame radius={22} style={{ ...card, padding: "26px 30px", opacity: prog(frame, 0, 10) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 600 }}>Audit log</div>
          <Mono size={17}>append only</Mono>
        </div>
        {rows.map((r, i) => {
          const t = prog(frame, 8 + i * 5, 20 + i * 5);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "13px 0",
                borderTop: `1px solid ${c.line}`,
                opacity: t,
                transform: `translateY(${(1 - t) * 24}px)`,
              }}
            >
              <Mono size={18} style={{ width: 96 }}>
                {r.at}
              </Mono>
              <Avatar name={r.who} size={34} tone={r.tone} />
              <div style={{ flex: 1, fontSize: 21 }}>
                <span style={{ fontWeight: 600 }}>{r.who}</span> <span style={{ color: c.muted }}>{r.what}</span>
              </div>
              {sq ? null : (
                <Mono size={16} color={c.faint}>
                  {r.tag}
                </Mono>
              )}
            </div>
          );
        })}
      </Frame>
      <div style={sq ? { position: "absolute", top: 90, left: 0, right: 0 } : { position: "absolute", left: x0, top: 390, width: 620 }}>
        <Words words={["Every", "action."]} start={20} stagger={5} size={sq ? 84 : 80} weight={700} style={sq ? undefined : { justifyContent: "flex-start" }} />
        <Words words={["On", "the", "record."]} start={34} stagger={5} size={sq ? 84 : 80} weight={500} color={c.muted} style={sq ? undefined : { justifyContent: "flex-start" }} />
      </div>
    </AbsoluteFill>
  );
}
