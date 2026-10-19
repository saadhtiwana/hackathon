import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { font, c } from "../theme";
import { prog } from "./motion";

type Word = string | { w: string; color?: string; mono?: boolean };

// Kinetic headline: each word rises into place on its own beat.
export function Words({
  words,
  start = 0,
  stagger = 4,
  size = 96,
  weight = 600,
  color = c.ink,
  style,
}: {
  words: Word[];
  start?: number;
  stagger?: number;
  size?: number;
  weight?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        fontFamily: font.sans,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: "-0.035em",
        lineHeight: 1.05,
        color,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: "0.24em",
        ...style,
      }}
    >
      {words.map((word, i) => {
        const w = typeof word === "string" ? { w: word } : word;
        const p = prog(frame, start + i * stagger, start + i * stagger + 14);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.08em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p) * 70}%)`,
                opacity: p,
                color: w.color,
                fontFamily: w.mono ? font.mono : undefined,
              }}
            >
              {w.w}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function split(s: string, color?: Record<string, string>): Word[] {
  return s.split(" ").map((w) => (color?.[w] ? { w, color: color[w] } : w));
}
