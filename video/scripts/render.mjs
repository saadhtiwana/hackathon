// Renders all cuts to out/. Sounds are synthesised first if public/audio is missing;
// public/music.mp3, when present, replaces the synthesised bed.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

if (!fs.existsSync("public/audio/music-bed.wav")) execFileSync("node", ["scripts/sounds.mjs"], { stdio: "inherit" });
console.log(fs.existsSync("public/music.mp3") ? "music: public/music.mp3" : "music: synthesised bed");

// Final mix: one static gain to about -20 LUFS, held so true peak stays at or under -1.5 dBTP. Video is copied as is.
function normalize(file) {
  const ff = (args) => execFileSync("npx", ["remotion", "ffmpeg", "-hide_banner", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const report = spawnSync("npx", ["remotion", "ffmpeg", "-hide_banner", "-i", file, "-vn", "-af", "loudnorm=print_format=summary", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const lufs = Number(report.match(/Input Integrated:\s+(-?[\d.]+)/)?.[1]);
  const peak = Number(report.match(/Input True Peak:\s+(-?[\d.]+)/)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak)) return console.log("\nloudness: could not measure, left as rendered");
  const gain = Math.min(-20 - lufs, -1.5 - peak);
  const tmp = file.replace(/\.mp4$/, ".tmp.mp4");
  fs.renameSync(file, tmp);
  ff(["-y", "-i", tmp, "-c:v", "copy", "-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file]);
  fs.rmSync(tmp);
  console.log(`\nloudness: ${lufs} LUFS, peak ${peak} dBTP, gain ${gain.toFixed(1)} dB`);
}

const outputs = [
  ["LaunchSquare", "relay-launch-2160x2160.mp4", 2, 16],
  ["LaunchSquare", "relay-launch-1080x1080-v2.mp4", 1, 18],
  ["Launch", "relay-launch-1920x1080-v2.mp4", 1, 18],
];
if (process.argv[2] === "normalize") {
  for (const [, file] of outputs) normalize(path.resolve("out", file));
  process.exit(0);
}

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
fs.mkdirSync("out", { recursive: true });
const only = process.argv[2];
for (const [id, file, scale, crf] of outputs) {
  if (only && !file.includes(only)) continue;
  const composition = await selectComposition({ serveUrl, id });
  const outputLocation = path.resolve("out", file);
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    pixelFormat: "yuv420p",
    crf,
    scale,
    audioCodec: "aac",
    audioBitrate: "192k",
    outputLocation,
    onProgress: ({ progress }) => process.stdout.write(`\r${file} ${Math.round(progress * 100)}%`),
  });
  normalize(outputLocation);
  console.log(outputLocation);
}
