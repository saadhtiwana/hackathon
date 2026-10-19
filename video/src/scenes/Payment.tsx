import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { c, font, useStage } from "../theme";
import { Cursor, Frame, Mono, Pill, Shot } from "../ui/kit";
import { Icon } from "../ui/icons";
import { easeInOut, prog } from "../ui/motion";

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;

// 26–31s: request a deposit, the customer pays through Stripe, the books update themselves.
export function Payment() {
  const frame = useCurrentFrame();
  const { sq, inner, width } = useStage();
  const x0 = (width - inner) / 2;
  const click = 22;
  const dialog = { left: x0, top: sq ? 70 : 160, width: sq ? inner : 640 };
  const btnTop = 330;
  const stripeIn = prog(frame, 28, 38) * (1 - prog(frame, 62, 70));
  const paying = prog(frame, 44, 56, (t) => t);
  const flip = prog(frame, 66, 76, easeInOut);
  const paid = flip >= 0.5;
  const dash = prog(frame, 76, 90);
  const collected = interpolate(frame, [86, 128], [0, 1250000], { easing: easeInOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rowTop = sq ? 500 : 600;

  return (
    <AbsoluteFill>
      <Frame radius={22} style={{ ...dialog, padding: 34, opacity: prog(frame, 0, 10), transform: `translateY(${(1 - prog(frame, 0, 10)) * 30}px)` }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Request payment</div>
        <div style={{ fontSize: 19, color: c.muted, marginTop: 4 }}>Hamza Raza gets a secure Stripe link by email.</div>
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, color: c.muted, marginBottom: 8 }}>Amount</div>
            <div style={{ border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 16px", fontFamily: font.mono, fontSize: 24 }}>PKR 50,000</div>
          </div>
          <div style={{ flex: 1.3 }}>
            <div style={{ fontSize: 17, color: c.muted, marginBottom: 8 }}>For</div>
            <div style={{ border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 16px", fontSize: 22 }}>Viewing deposit</div>
          </div>
        </div>
        <div style={{ height: btnTop - 250 }} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{
              background: frame >= click ? c.soft : c.ink,
              color: frame >= click ? c.ink : "#fff",
              fontSize: 20,
              fontWeight: 600,
              padding: "16px 26px",
              borderRadius: 14,
              transform: `scale(${frame >= click - 2 && frame < click + 3 ? 0.96 : 1})`,
            }}
          >
            {frame >= click ? "Link sent" : "Send payment link"}
          </div>
        </div>
      </Frame>

      <Frame radius={20} style={{ left: dialog.left, top: rowTop, width: dialog.width, padding: "22px 28px", display: "flex", alignItems: "center", gap: 18, opacity: prog(frame, 30, 40) }}>
        <Icon name="card" size={26} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Viewing deposit · Hamza Raza</div>
          <Mono size={18}>PKR 50,000 · via Stripe</Mono>
        </div>
        <div style={{ transform: `perspective(400px) rotateX(${paid ? (1 - flip) * -90 : flip * 90}deg)` }}>
          {paid ? (
            <Pill bg={c.greenTint} fg={c.green} size={20}>
              <Icon name="check" size={18} /> Paid
            </Pill>
          ) : (
            <Pill bg={c.yellowTint} fg={c.yellow} size={20}>
              Requested
            </Pill>
          )}
        </div>
      </Frame>

      {sq ? null : (
        <Frame style={{ left: x0 + 700, top: 130, width: inner - 700, height: 560, opacity: dash, transform: `translateY(${(1 - dash) * 40}px)` }}>
          <Shot name="dashboard" x={50} y={0} zoom={1.04 + frame * 0.0005} />
        </Frame>
      )}
      <Frame
        radius={22}
        style={{
          left: sq ? x0 : x0 + inner - 600,
          top: sq ? 680 : 640,
          width: sq ? inner : 600,
          padding: "28px 32px",
          opacity: dash,
          transform: `translateY(${(1 - dash) * 50}px)`,
          background: c.greenTint,
          border: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 21, color: c.green, fontWeight: 500 }}>Collected this month</div>
          <Icon name="arrowUp" size={22} color={c.green} />
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 68, fontWeight: 500, letterSpacing: "-0.04em", color: c.green, marginTop: 8, whiteSpace: "nowrap" }}>{rs(collected)}</div>
      </Frame>

      {/* Stripe Checkout, briefly */}
      <Frame
        radius={22}
        style={{
          left: width / 2 - 280,
          top: sq ? 300 : 280,
          width: 560,
          padding: 34,
          opacity: stripeIn,
          transform: `translateY(${(1 - stripeIn) * 40}px) scale(${0.95 + 0.05 * stripeIn})`,
          boxShadow: "0 40px 120px -30px rgba(23,20,15,0.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 19, color: c.muted }}>Margalla Estates</div>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 16, color: c.muted }}>
            <Icon name="lock" size={15} /> Stripe Checkout
          </span>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 44, fontWeight: 500, marginTop: 10 }}>PKR 50,000</div>
        <div style={{ border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 16px", fontFamily: font.mono, fontSize: 21, marginTop: 20, display: "flex", justifyContent: "space-between" }}>
          <span>4242 4242 4242 4242</span>
          <span style={{ color: c.muted }}>12/29</span>
        </div>
        <div style={{ position: "relative", marginTop: 18, height: 58, borderRadius: 12, background: c.ink, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, width: `${paying * 100}%`, background: "rgba(255,255,255,0.16)" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#fff", fontSize: 20, fontWeight: 600 }}>
            {paying >= 1 ? <Icon name="check" size={20} /> : null}
            {paying >= 1 ? "Paid" : paying > 0 ? "Processing" : "Pay PKR 50,000"}
          </div>
        </div>
      </Frame>

      <Cursor
        path={[
          { f: 2, x: dialog.left + dialog.width - 60, y: dialog.top + 520 },
          { f: 18, x: dialog.left + dialog.width - 150, y: dialog.top + btnTop + 30 },
          { f: 34, x: width / 2 + 40, y: (sq ? 300 : 280) + 300 },
          { f: 42, x: width / 2 + 10, y: (sq ? 300 : 280) + 290 },
          { f: 70, x: width / 2 + 60, y: (sq ? 300 : 280) + 420 },
        ]}
        clicks={[click, 44]}
      />
    </AbsoluteFill>
  );
}
