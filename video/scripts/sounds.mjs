// Synthesises the music bed and UI sounds into public/audio (git-ignored). Everything is generated here,
// no samples or downloaded tracks. 48 kHz, 16-bit stereo WAV.
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

// Music bed: 40 s, 80 bpm. A slow pad on Cmaj7 → Am7 → Fmaj7 → G6 (3 s per chord, matching the cuts)
// and a soft pluck arpeggio on top. Fades are applied in the composition.
{
  const len = SR * 41;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const chords = [
    [48, 55, 59, 64],
    [45, 52, 55, 60],
    [41, 48, 52, 57],
    [43, 50, 55, 59],
  ];
  const chordLen = 3;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const k = Math.floor(t / chordLen);
    let l = 0;
    let r = 0;
    for (const [idx, ch] of [[k, chords[k % 4]], [k - 1, chords[(k + 3) % 4]]]) {
      if (idx < 0) continue;
      const age = t - idx * chordLen;
      const env = Math.min(1, age / 1.2) * Math.exp(-Math.max(0, age - chordLen) / 0.6);
      if (env < 1e-4) continue;
      for (const n of ch) {
        const f = hz(n);
        l += env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t));
        r += env * (Math.sin(2 * Math.PI * f * 0.998 * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.001 * t) * 0.3);
      }
    }
    const swell = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.08 * t);
    L[i] = l * 0.05 * swell;
    R[i] = r * 0.05 * swell;
  }
  lowpass(L, 1400);
  lowpass(R, 1400);
  // Pluck: one note every half beat (0.375 s), walking the current chord an octave up.
  const pl = new Float32Array(len);
  const step = 0.375;
  for (let n = 0; n * step < 40; n++) {
    if (n % 8 === 7) continue;
    const t0 = n * step;
    const ch = chords[Math.floor(t0 / chordLen) % 4];
    const f = hz(ch[[0, 2, 1, 3, 2, 1, 3, 0][n % 8]] + 24);
    const vel = n % 2 ? 0.55 : 0.8;
    const start = Math.round(t0 * SR);
    for (let i = 0; i < SR * 1.2 && start + i < len; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.28);
      pl[start + i] += vel * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t / 0.08));
    }
  }
  lowpass(pl, 3200);
  const plL = reverb(pl, 0.35, 0);
  const plR = reverb(pl, 0.35, 23);
  for (let i = 0; i < len; i++) {
    L[i] += plL[i] * 0.09;
    R[i] += plR[i] * 0.09;
  }
  wav("music-bed.wav", L, R, 0.8);
}

// Click: a soft, short tap, a filtered transient plus a quick high body.
{
  const len = Math.round(SR * 0.07);
  const x = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    x[i] = Math.exp(-t / 0.006) * (0.6 * Math.sin(2 * Math.PI * 1900 * t) + 0.4 * Math.sin(2 * Math.PI * 950 * t)) + noise() * Math.exp(-t / 0.0015) * 0.3;
  }
  lowpass(x, 6000);
  wav("click.wav", x, x, 0.5);
}

// Whoosh: noise through a resonant band-pass that sweeps up and back, rising and falling envelope.
{
  const len = Math.round(SR * 0.5);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  let low = 0;
  let band = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const cut = 350 + 2200 * Math.sin(Math.PI * p) ** 2;
    const f = 2 * Math.sin((Math.PI * cut) / SR);
    const high = noise() - low - 0.9 * band;
    band += f * high;
    low += f * band;
    const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
    L[i] = band * env * (1 - 0.4 * p);
    R[i] = band * env * (0.6 + 0.4 * p);
  }
  wav("whoosh.wav", L, R, 0.35);
}

// Tick: a tiny wooden tick for the countdown reaching zero.
{
  const len = Math.round(SR * 0.09);
  const x = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    x[i] = Math.exp(-t / 0.012) * (Math.sin(2 * Math.PI * 1500 * t) + 0.35 * Math.sin(2 * Math.PI * 3100 * t)) + noise() * Math.exp(-t / 0.001) * 0.15;
  }
  wav("tick.wav", x, x, 0.45);
}

// Chime: two soft bell notes a fourth apart (B5 → E6), with a few inharmonic partials and a gentle tail.
{
  const len = Math.round(SR * 1.8);
  const x = new Float32Array(len);
  for (const [f0, at, vel] of [[987.77, 0, 0.7], [1318.51, 0.09, 1]]) {
    const s = Math.round(at * SR);
    for (let i = 0; s + i < len; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.003);
      x[s + i] +=
        vel * env * (Math.sin(2 * Math.PI * f0 * t) * Math.exp(-t / 0.55) + 0.3 * Math.sin(2 * Math.PI * f0 * 2.76 * t) * Math.exp(-t / 0.18) + 0.12 * Math.sin(2 * Math.PI * f0 * 5.4 * t) * Math.exp(-t / 0.07));
    }
  }
  const L = reverb(x, 0.25, 0);
  const R = reverb(x, 0.25, 31);
  wav("chime.wav", L, R, 0.45);
}
