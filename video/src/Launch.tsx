import { AbsoluteFill, Audio, Sequence, getStaticFiles, staticFile } from "remotion";
import { c, font } from "./theme";
import { ColdOpen } from "./scenes/ColdOpen";
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
  [0, 90, ColdOpen],
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
// Sounds dropped into public/sfx win over the synthesised set in public/audio (scripts/sounds.mjs).
const sound = (name: string) => (files.has(`sfx/${name}.wav`) ? `sfx/${name}.wav` : files.has(`audio/${name}.wav`) ? `audio/${name}.wav` : null);

type Cue = [name: string, frame: number, volume: number];
const range = (n: number, f: (i: number) => Cue) => Array.from({ length: n }, (_, i) => f(i));

// No music bed: interface sounds with silence between, and three short musical accents.
// Whooshes start a few frames early so they peak on the cut.
const cuts = [90, 180, 270, 450, 630, 780, 930, 1050, 1146];
const typing = range(21, (i): Cue => [`key${(i * 7) % 4}`, 680 + i * 2, 0.11 + ((i * 5) % 3) * 0.025]).filter((_, i) => i % 6 !== 5);
const cues: Cue[] = [
  ...cuts.map((f): Cue => ["whoosh", f - 8, 0.22]),
  // cold open: card, the clock racing (ticks speed up with the drain), 0:00, the pile behind
  ["pop1", 3, 0.2],
  ...[14, 22, 30, 38, 44, 49, 53].map((f, i): Cue => [i % 2 ? "tock" : "tick", f, 0.12 + i * 0.016]),
  ["thud", 57, 0.5],
  ...[62, 66, 70, 74].map((f, i): Cue => [`pop${i % 3}`, f, 0.08]),
  // pile-up of unanswered pings
  ...range(7, (i): Cue => [`pop${i % 3}`, 90 + i * 5, 0.12]),
  // logo reveal
  ["sting", 182, 0.34],
  // new lead row, push in, last three seconds, 0:00
  ["pop0", 284, 0.18],
  ["whoosh", 330, 0.1],
  ["tick", 430, 0.18],
  ["tock", 432, 0.18],
  ["tick", 435, 0.2],
  ["riser", 424, 0.16],
  ["thud", 437, 0.45],
  // hand-off: custody rows, escalation email
  ["pop0", 458, 0.12],
  ...[466, 498, 536].map((f, i): Cue => [`pop${i}`, f, 0.15]),
  ["ding", 546, 0.26],
  // acknowledge, typed reply, calendar card
  ["pop1", 636, 0.1],
  ["click", 660, 0.3],
  ...typing,
  ["pop2", 728, 0.16],
  // payment
  ["click", 802, 0.3],
  ["pop1", 809, 0.15],
  ["click", 824, 0.3],
  ["rise", 840, 0.22],
  ["chime", 851, 0.3],
  ["pop0", 856, 0.14],
  // audit rows
  ...range(8, (i): Cue => [`pop${i % 3}`, 938 + i * 5, 0.09]),
  // closing: stack chips, then the resolve under the logo and credits
  ...range(6, (i): Cue => [`pop${(i + 1) % 3}`, 1080 + i * 4, 0.1]),
  ["resolve", 1124, 0.36],
];

export function Launch() {
  return (
    <AbsoluteFill style={{ background: c.paper, fontFamily: font.sans, color: c.ink }}>
      {scenes.map(([from, dur, Scene]) => (
        <Sequence key={from} from={from} durationInFrames={dur} premountFor={15}>
          <Scene />
        </Sequence>
      ))}
      {cues.map(([name, at, volume]) => {
        const src = sound(name);
        return src ? (
          <Sequence key={`${name}-${at}`} from={at} durationInFrames={Math.min(90, TOTAL - at)} layout="none">
            <Audio src={staticFile(src)} volume={volume} />
          </Sequence>
        ) : null;
      })}
    </AbsoluteFill>
  );
}
