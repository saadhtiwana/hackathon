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

const files = new Set(getStaticFiles().map((f) => f.name));
// A supplied track wins; otherwise the bed synthesised by scripts/sounds.mjs.
const music = files.has("music.mp3") ? "music.mp3" : files.has("audio/music-bed.wav") ? "audio/music-bed.wav" : null;

// UI sounds, by absolute frame. Whooshes start a few frames early so they peak on the cut.
const cuts = [90, 180, 270, 450, 630, 780, 930, 1050, 1146];
const cues: [string, number, number][] = [
  ...cuts.map((f): [string, number, number] => ["whoosh", f - 8, 0.45]),
  ["tick", 438, 0.7],
  ["click", 660, 0.6],
  ["click", 802, 0.6],
  ["click", 824, 0.6],
  ["chime", 851, 0.5],
];

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
          src={staticFile(music)}
          volume={(f) => interpolate(f, [0, 30, TOTAL - 60, TOTAL], [0, 0.18, 0.18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      ) : null}
      {cues.map(([name, at, volume]) =>
        files.has(`audio/${name}.wav`) ? (
          <Sequence key={`${name}-${at}`} from={at} durationInFrames={60} layout="none">
            <Audio src={staticFile(`audio/${name}.wav`)} volume={volume} />
          </Sequence>
        ) : null,
      )}
    </AbsoluteFill>
  );
}
