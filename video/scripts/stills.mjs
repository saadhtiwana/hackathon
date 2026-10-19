// Contact sheet for checking frames without the studio: node scripts/stills.mjs Launch 30 120 ...
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const [id = "Launch", ...frames] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id });
for (const f of frames) {
  const output = path.resolve(`out/stills/${id}-${String(f).padStart(4, "0")}.png`);
  await renderStill({ serveUrl, composition, frame: Number(f), output, scale: 0.5 });
  console.log(output);
}
