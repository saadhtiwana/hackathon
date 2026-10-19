// Renders both cuts to out/. Music is picked up from public/music.mp3 when present.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const music = fs.existsSync("public/music.mp3");
console.log(music ? "music: public/music.mp3" : "music: none, rendering silent");
fs.mkdirSync("out", { recursive: true });
for (const [id, file] of [
  ["Launch", "relay-launch-1920x1080.mp4"],
  ["LaunchSquare", "relay-launch-1080x1080.mp4"],
]) {
  const composition = await selectComposition({ serveUrl, id });
  const outputLocation = path.resolve("out", file);
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    pixelFormat: "yuv420p",
    crf: 18,
    muted: !music,
    outputLocation,
    onProgress: ({ progress }) => process.stdout.write(`\r${id} ${Math.round(progress * 100)}%`),
  });
  console.log(`\n${outputLocation}`);
}
