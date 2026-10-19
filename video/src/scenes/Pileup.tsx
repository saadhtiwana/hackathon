import { AbsoluteFill, useCurrentFrame } from "remotion";
import { c, useStage } from "../theme";
import { Frame, Mono } from "../ui/kit";
import { Icon, type IconName } from "../ui/icons";
import { prog } from "../ui/motion";
import { Words } from "../ui/Words";

const pings: { icon: IconName; source: string; who: string; text: string; ago: string }[] = [
  { icon: "message", source: "WhatsApp", who: "Ayesha Khan", text: "Is the F-7 flat still available?", ago: "2h" },
  { icon: "mail", source: "Email", who: "Hamza Raza", text: "Viewing for the 3-bed in DHA?", ago: "1h" },
  { icon: "globe", source: "Web form", who: "Bilal Ahmed", text: "Need a quote for two units", ago: "52m" },
  { icon: "message", source: "WhatsApp", who: "Sana Malik", text: "Hello? Anyone there?", ago: "40m" },
  { icon: "mail", source: "Email", who: "Omar Farooq", text: "Following up on my enquiry", ago: "31m" },
  { icon: "globe", source: "Web form", who: "Zara Iqbal", text: "Can someone call me back", ago: "18m" },
  { icon: "message", source: "Discord", who: "Ali Hassan", text: "Still waiting on pricing", ago: "6m" },
];

// 3–6s: unanswered pings stack up, then fall away.
export function Pileup() {
  const frame = useCurrentFrame();
  const { sq } = useStage();
  const cardW = sq ? 720 : 640;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: "50%", top: sq ? 120 : 150, width: cardW, marginLeft: -cardW / 2, height: 600 }}>
        {pings.map((p, i) => {
          const t = prog(frame, i * 5, i * 5 + 14);
          const fall = prog(frame, 52 + i * 2, 76 + i * 2);
          const y = i * 66 - (1 - t) * 60 + fall * (700 + i * 30);
          const rot = (i % 2 ? 1 : -1) * (1.2 + (i % 3) * 0.6) * (0.4 + fall * 2.5);
          return (
            <Frame
              key={i}
              small
              radius={20}
              style={{
                left: (i % 3) * 14 - 14,
                top: y,
                width: cardW,
                padding: "20px 24px",
                opacity: t * (1 - fall),
                transform: `rotate(${rot}deg) scale(${0.96 + t * 0.04})`,
                display: "flex",
                gap: 18,
                alignItems: "center",
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 14, background: c.soft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={p.icon} size={24} color={c.ink} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 600 }}>
                  {p.who} <span style={{ color: c.muted, fontWeight: 400 }}>· {p.source}</span>
                </div>
                <div style={{ fontSize: 20, color: c.muted, marginTop: 2 }}>{p.text}</div>
              </div>
              <Mono size={18} color={c.red}>
                {p.ago} unread
              </Mono>
            </Frame>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: sq ? 150 : 120 }}>
        <Words words={["Leads", "don't", "get", "lost."]} start={34} stagger={4} size={sq ? 76 : 88} />
        <Words words={["They", "get", { w: "dropped.", color: c.red }]} start={58} stagger={5} size={sq ? 76 : 88} weight={700} style={{ marginTop: 6 }} />
      </div>
    </AbsoluteFill>
  );
}
