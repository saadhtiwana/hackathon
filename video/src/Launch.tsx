import { AbsoluteFill, Audio, Sequence, getStaticFiles, interpolate, staticFile } from "remotion";
import { c, font } from "./theme";
import { Silence } from "./scenes/Silence";
import { Pileup } from "./scenes/Pileup";
import { Reveal } from "./scenes/Reveal";
import { NewLead } from "./scenes/NewLead";
import { Handoff } from "./scenes/Handoff";
import { Acknowledge } from "./scenes/Acknowledge";
import { Payment } from "./scenes/Payment";
import { Audit } from "./scenes/Audit";
import { Closing } from "./scenes/Closing";

// Hard cuts on 3 second beats; each entry is [from, duration] in frames at 30fps.
const scenes = [
  [0, 90, Silence],
  [90, 90, Pileup],
  [180, 90, Reveal],
  [270, 180, NewLead],
  [450, 180, Handoff],
  [630, 150, Acknowledge],
  [780, 150, Payment],
  [930, 120, Audit],
  [1050, 150, Closing],
] as const;

export const TOTAL = 1200;

const music = getStaticFiles().some((f) => f.name === "music.mp3");

export function Launch() {
  return (
    <AbsoluteFill style={{ background: c.paper, fontFamily: font.sans, color: c.ink }}>
      {scenes.map(([from, dur, Scene]) => (
        <Sequence key={from} from={from} durationInFrames={dur} premountFor={15}>
          <Scene />
        </Sequence>
      ))}
      {music ? (
        <Audio
          src={staticFile("music.mp3")}
          volume={(f) => interpolate(f, [0, 30, TOTAL - 45, TOTAL], [0, 0.9, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      ) : null}
    </AbsoluteFill>
  );
}
