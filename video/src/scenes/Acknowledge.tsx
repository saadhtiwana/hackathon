import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Avatar, Cursor, Frame, Mono, Pill, Ring } from "../ui/kit";
import { Icon } from "../ui/icons";
import { prog } from "../ui/motion";

const reply = "Hi Hamza, yes it is. I've booked you a viewing for Thursday at 4 pm. See you there. Malik Saad Hayat, Margalla Estates";

// 21–26s: one click to own it, the reply lands in the customer's thread, the viewing lands on the calendar.
export function Acknowledge() {
  const frame = useCurrentFrame();
  const { sq, inner, width } = useStage();
  const x0 = (width - inner) / 2;
  const click = 30;
  const done = frame >= click;
  const card = { left: x0, top: sq ? 90 : 250, width: sq ? inner : 660, height: 300 };
  const btn = { left: 36, top: 206, width: 250, height: 62 };
  const thread = sq ? { left: x0, top: 420, width: inner } : { left: x0 + 720, top: 190, width: inner - 720 };
  const typed = Math.floor(reply.length * prog(frame, 50, 92, (t) => t));
  const replyIn = prog(frame, 44, 54);
  const cal = prog(frame, 98, 114);
  const secs = Math.max(0, 24 - Math.floor(frame / 3));

  return (
    <AbsoluteFill>
      <Frame radius={22} style={{ ...card, padding: 36, opacity: prog(frame, 0, 12), transform: `translateY(${(1 - prog(frame, 0, 12)) * 30}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Avatar name="Hamza Raza" size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>Hamza Raza</div>
            <div style={{ fontSize: 20, color: c.muted }}>Escalated to Malik Saad Hayat · level 2</div>
          </div>
          {done ? (
            <Pill bg={c.greenTint} fg={c.green} size={19} style={{ transform: `scale(${0.8 + 0.2 * prog(frame, click, click + 8)})` }}>
              <Icon name="check" size={18} /> Acknowledged
            </Pill>
          ) : (
            <Ring size={76} stroke={6} left={secs / 30} label={`0:${String(secs).padStart(2, "0")}`} />
          )}
        </div>
        <div style={{ fontSize: 21, color: c.muted, marginTop: 22 }}>Viewing for the 3-bed in DHA Phase 2</div>
        <div
          style={{
            position: "absolute",
            ...btn,
            borderRadius: 14,
            background: done ? c.greenTint : c.ink,
            color: done ? c.green : "#fff",
            fontSize: 21,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transform: `scale(${frame >= click - 2 && frame < click + 3 ? 0.96 : 1})`,
          }}
        >
          {done ? <Icon name="check" size={20} /> : null}
          {done ? "It's mine" : "Acknowledge"}
        </div>
        <Mono size={18} style={{ position: "absolute", left: 312, top: 228 }}>
          {done ? "first response 0:06" : "window 0:30"}
        </Mono>
      </Frame>

      <Frame radius={22} style={{ ...thread, padding: "28px 32px", opacity: prog(frame, 6, 18), transform: `translateY(${(1 - prog(frame, 6, 18)) * 30}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 18, borderBottom: `1px solid ${c.line}` }}>
          <Icon name="mail" size={22} />
          <div style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Re: Viewing for the 3-bed in DHA Phase 2</div>
          <Mono size={16}>Gmail thread</Mono>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
          <Avatar name="Hamza Raza" size={40} />
          <div style={{ background: "#F6F4EF", borderRadius: 16, padding: "14px 18px", fontSize: 20, lineHeight: 1.4, maxWidth: "80%" }}>
            Hi, is the 3-bed in DHA Phase 2 still available? I'd like to see it this week.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 18, justifyContent: "flex-end", opacity: replyIn, transform: `translateY(${(1 - replyIn) * 16}px)`, minHeight: 130 }}>
          <div style={{ background: c.ink, color: "#fff", borderRadius: 16, padding: "14px 18px", fontSize: 20, lineHeight: 1.4, maxWidth: "80%" }}>
            {reply.slice(0, typed)}
            <span style={{ opacity: typed < reply.length && frame % 14 < 8 ? 1 : 0 }}>|</span>
          </div>
          <Avatar name="Malik Saad Hayat" size={40} tone={3} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, opacity: prog(frame, 92, 98) }}>
          <Mono size={16}>sent from Relay · delivered</Mono>
        </div>
      </Frame>

      <Frame
        radius={20}
        small
        style={{
          left: sq ? x0 + inner - 560 : x0 + 80,
          top: sq ? 820 : 640,
          width: 560,
          padding: "22px 26px",
          display: "flex",
          gap: 18,
          opacity: cal,
          transform: `translateX(${(1 - cal) * -80}px)`,
        }}
      >
        <div style={{ width: 6, borderRadius: 6, background: c.blue }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: c.muted, fontSize: 17 }}>
            <Icon name="calendar" size={18} /> Google Calendar · invite sent
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>Viewing · Hamza Raza</div>
          <div style={{ display: "flex", gap: 18, marginTop: 6, fontSize: 19, color: c.muted }}>
            <span style={{ fontFamily: "inherit" }}>Thu · 4:00 – 4:30 pm</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="pin" size={17} /> DHA Phase 2
            </span>
          </div>
        </div>
      </Frame>

      <Cursor
        path={[
          { f: 4, x: card.left + card.width - 80, y: card.top + card.height + 140 },
          { f: 26, x: card.left + btn.left + btn.width / 2, y: card.top + btn.top + btn.height / 2 },
          { f: 60, x: card.left + btn.left + btn.width / 2 + 30, y: card.top + btn.top + btn.height / 2 + 40 },
        ]}
        clicks={[click]}
      />
    </AbsoluteFill>
  );
}
