// Draws the audio of a render as a waveform PNG with scene cuts marked: node scripts/waveform.mjs out/x.mp4 out/audio.png
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import zlib from "node:zlib";

const [input, output] = process.argv.slice(2);
const SR = 8000;
const pcm = spawnSync("npx", ["remotion", "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", String(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"], { maxBuffer: 1 << 28 }).stdout;
const data = pcm.indexOf("data") + 8;
const body = Buffer.from(pcm.subarray(data));
const samples = new Int16Array(body.buffer, body.byteOffset, body.length >> 1);

const W = 2000;
const H = 400;
const px = Buffer.alloc(W * H * 3, 0xff);
const set = (x, y, [r, g, b]) => {
  const i = (y * W + x) * 3;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
};
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) set(x, y, [244, 241, 234]);
const per = samples.length / W;
for (let x = 0; x < W; x++) {
  let peak = 0;
  let sq = 0;
  const a = Math.floor(x * per);
  const b = Math.floor((x + 1) * per);
  for (let i = a; i < b; i++) {
    const v = Math.abs(samples[i]) / 32768;
    peak = Math.max(peak, v);
    sq += v * v;
  }
  const rms = Math.sqrt(sq / Math.max(1, b - a));
  const ph = Math.round(peak * (H / 2 - 10));
  const rh = Math.round(rms * (H / 2 - 10));
  for (let d = -ph; d <= ph; d++) set(x, H / 2 + d, [150, 145, 135]);
  for (let d = -rh; d <= rh; d++) set(x, H / 2 + d, [23, 20, 15]);
}
const seconds = samples.length / SR;
for (const f of [90, 180, 270, 450, 630, 780, 930, 1050, 1146]) {
  const x = Math.round((f / 30 / seconds) * W);
  for (let y = 0; y < H; y += 4) set(Math.min(W - 1, x), y, [229, 72, 42]);
}
for (let x = 0; x < W; x++) set(x, H / 2, [200, 195, 185]);

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
fs.writeFileSync(output, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));

// Share of 100 ms windows that are near-silent, to show there is no continuous bed.
const win = SR / 10;
let quiet = 0;
let total = 0;
for (let i = 0; i + win <= samples.length; i += win, total++) {
  let sq = 0;
  for (let j = i; j < i + win; j++) sq += (samples[j] / 32768) ** 2;
  if (20 * Math.log10(Math.sqrt(sq / win) + 1e-9) < -50) quiet++;
}
console.log(`${output} · ${Math.round((100 * quiet) / total)}% of 100 ms windows below -50 dBFS`);
