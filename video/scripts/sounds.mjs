// Synthesises the interface sounds and the three short musical accents into public/audio (git-ignored).
// Everything is generated here, no samples or downloaded tracks. 48 kHz, 16-bit stereo WAV.
// Files dropped into public/sfx with the same names take priority in the composition.
import fs from "node:fs";

const SR = 48000;
const dir = new URL("../public/audio/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });

function wav(name, L, R = L, peak = 0.9) {
  let max = 1e-9;
  for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak / max;
  const buf = Buffer.alloc(44 + L.length * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + L.length * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(L.length * 4, 40);
  for (let i = 0; i < L.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(new URL(name, dir), buf);
  console.log(`audio/${name}`);
}

let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function lowpass(x, cutoff) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y += a * (x[i] - y);
  return x;
}

// Small Schroeder reverb: parallel combs into series allpasses.
function reverb(x, mix = 0.3, offset = 0) {
  const out = new Float32Array(x.length);
  for (const [d, fb] of [[1557, 0.8], [1617, 0.79], [1491, 0.81], [1422, 0.8]].map(([d, f]) => [d + offset, f])) {
    const b = new Float32Array(d);
    for (let i = 0, j = 0; i < x.length; i++, j = (j + 1) % d) {
      const y = b[j];
      b[j] = x[i] + y * fb;
      out[i] += y * 0.25;
    }
  }
  for (const d of [225, 556]) {
    const b = new Float32Array(d);
    for (let i = 0, j = 0; i < out.length; i++, j = (j + 1) % d) {
      const y = b[j];
      const v = out[i] + y * 0.5;
      b[j] = v;
      out[i] = y - v * 0.5;
    }
  }
  return x.map((v, i) => v * (1 - mix) + out[i] * mix);
}


const secs = (s) => new Float32Array(Math.round(SR * s));
const fadeOut = (x, ms = 15) => {
  const n = Math.round((SR * ms) / 1000);
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
};

// Soft piano-ish note: a few harmonics, upper ones dying first, soft hammer.
function note(x, f, at, vel, decay = 1.2) {
  const s = Math.round(at * SR);
  for (let i = 0; s + i < x.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.006) * Math.exp(-t / decay);
    if (env < 1e-5) break;
    x[s + i] += vel * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t / 0.35) + 0.12 * Math.sin(6 * Math.PI * f * t) * Math.exp(-t / 0.15));
  }
}

// Warm pad voice: two detuned sines with a slow swell.
function pad(x, f, at, len, vel, attack = 0.4) {
  const s = Math.round(at * SR);
  for (let i = 0; s + i < x.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, (len - t) / 0.6));
    if (t > len) break;
    x[s + i] += vel * env * (Math.sin(2 * Math.PI * f * t) + 0.6 * Math.sin(2 * Math.PI * f * 1.004 * t));
  }
}

const stereo = (x, o1 = 0, o2 = 23, mix = 0.3) => [reverb(x, mix, o1), reverb(x, mix, o2)];

// Click: soft, short tap.
{
  const x = secs(0.07);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.exp(-t / 0.006) * (0.6 * Math.sin(2 * Math.PI * 1900 * t) + 0.4 * Math.sin(2 * Math.PI * 950 * t)) + noise() * Math.exp(-t / 0.0015) * 0.3;
  }
  lowpass(x, 6000);
  wav("click.wav", x, x, 0.9);
}

// Whoosh: noise through a resonant band-pass sweeping up and back.
{
  const L = secs(0.42);
  const R = secs(0.42);
  let low = 0;
  let band = 0;
  for (let i = 0; i < L.length; i++) {
    const p = i / L.length;
    const cut = 300 + 1900 * Math.sin(Math.PI * p) ** 2;
    const f = 2 * Math.sin((Math.PI * cut) / SR);
    const high = noise() - low - 0.9 * band;
    band += f * high;
    low += f * band;
    const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
    L[i] = band * env * (1 - 0.4 * p);
    R[i] = band * env * (0.6 + 0.4 * p);
  }
  wav("whoosh.wav", L, R, 0.9);
}

// Keys: four slightly different soft keyboard ticks.
for (let k = 0; k < 4; k++) {
  const x = secs(0.045);
  const body = [620, 700, 560, 760][k];
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = noise() * Math.exp(-t / 0.0018) * 0.5 + Math.sin(2 * Math.PI * body * t) * Math.exp(-t / 0.009);
  }
  lowpass(x, 4200);
  wav(`key${k}.wav`, fadeOut(x, 5), x, 0.9);
}

// Pops: a rounded bubble with a quick downward pitch bend, three pitches.
for (const [k, base] of [[0, 1], [1, 1.19], [2, 1.41]]) {
  const x = secs(0.12);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const f = base * (380 + 520 * Math.exp(-t / 0.018));
    ph += (2 * Math.PI * f) / SR;
    x[i] = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.035);
  }
  wav(`pop${k}.wav`, fadeOut(x), x, 0.9);
}

// Tick and tock for the clock.
for (const [name, f] of [["tick", 1500], ["tock", 1050]]) {
  const x = secs(0.08);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.exp(-t / 0.01) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.1 * t)) + noise() * Math.exp(-t / 0.001) * 0.12;
  }
  lowpass(x, 5000);
  wav(`${name}.wav`, fadeOut(x), x, 0.9);
}

// Riser: a short rising tone for the last seconds on the clock.
{
  const x = secs(0.42);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const p = t / 0.42;
    ph += (2 * Math.PI * (330 + 560 * p * p)) / SR;
    x[i] = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * p * p;
  }
  wav("riser.wav", fadeOut(x, 8), x, 0.9);
}

// Thud: a low, short body hit for 0:00.
{
  const x = secs(0.4);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (48 + 50 * Math.exp(-t / 0.04))) / SR;
    x[i] = Math.sin(ph) * Math.min(1, t / 0.003) * Math.exp(-t / 0.11) + noise() * Math.exp(-t / 0.012) * 0.25;
  }
  lowpass(x, 900);
  wav("thud.wav", fadeOut(x), x, 0.9);
}

// Chime: two clean notes, B5 then E6, for Paid.
{
  const x = secs(1.6);
  note(x, 987.77, 0, 0.7, 0.5);
  note(x, 1318.51, 0.11, 1, 0.6);
  lowpass(x, 7000);
  const [L, R] = stereo(x, 0, 31, 0.22);
  wav("chime.wav", L, R, 0.9);
}

// Ding: one soft bell for the escalation email landing.
{
  const x = secs(1.1);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.min(1, t / 0.003) * (Math.sin(2 * Math.PI * 1174.66 * t) * Math.exp(-t / 0.35) + 0.25 * Math.sin(2 * Math.PI * 1174.66 * 2.76 * t) * Math.exp(-t / 0.09));
  }
  const [L, R] = stereo(x, 0, 19, 0.2);
  wav("ding.wav", L, R, 0.9);
}

// Sting under the logo reveal: a soft Cmaj9 swell with a rolled piano chord on top, about 2 s.
{
  const x = secs(2.4);
  for (const n of [48, 55, 59, 62]) pad(x, hz(n), 0, 1.7, 0.12, 0.35);
  [60, 64, 67, 71, 74].forEach((n, i) => note(x, hz(n), 0.18 + i * 0.045, 0.32, 0.9));
  lowpass(x, 3200);
  const [L, R] = stereo(x, 0, 29, 0.35);
  wav("sting.wav", L, R, 0.9);
}

// Rise for the Paid moment: a quick upward G-major arpeggio, about 1 s.
{
  const x = secs(1.3);
  [67, 71, 74, 79].forEach((n, i) => note(x, hz(n), i * 0.075, 0.5 + i * 0.1, 0.45));
  pad(x, hz(55), 0, 0.9, 0.08, 0.25);
  lowpass(x, 4200);
  const [L, R] = stereo(x, 0, 17, 0.3);
  wav("rise.wav", L, R, 0.9);
}

// Resolve under the closing logo and credits: Gsus4 leaning into a warm C major, about 2.5 s.
{
  const x = secs(2.5);
  for (const n of [43, 50, 55, 60]) pad(x, hz(n), 0, 0.75, 0.1, 0.25);
  for (const n of [48, 55, 60, 64]) pad(x, hz(n), 0.55, 1.8, 0.11, 0.3);
  [60, 67, 72, 76].forEach((n, i) => note(x, hz(n), 0.55 + i * 0.05, 0.3, 1.1));
  lowpass(x, 3000);
  const [L, R] = stereo(x, 0, 37, 0.38);
  wav("resolve.wav", fadeOut(L, 300), fadeOut(R, 300), 0.9);
}
