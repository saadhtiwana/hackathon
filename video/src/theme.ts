import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";
import { useVideoConfig } from "remotion";

const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const font = { sans: sans.fontFamily, mono: mono.fontFamily };

export const c = {
  paper: "#F4F1EA",
  ink: "#17140F",
  red: "#E5482A",
  card: "#FFFFFF",
  muted: "#686761",
  faint: "#8C8B86",
  line: "#E6E2D8",
  soft: "#EBE7DE",
  green: "#1B7A43",
  greenTint: "#E7F4EB",
  yellow: "#674A08",
  yellowTint: "#FAF2DA",
  blue: "#1E4A8C",
  blueTint: "#E7EFFB",
  pinkTint: "#FAE9EF",
  pink: "#872350",
};

export const shadow = "0 2px 4px rgba(23,20,15,0.04), 0 24px 60px -18px rgba(23,20,15,0.22)";
export const shadowSm = "0 1px 2px rgba(23,20,15,0.05), 0 10px 28px -12px rgba(23,20,15,0.2)";

// Both formats are 1080 tall, so type sizes hold; only the usable width changes.
export function useStage() {
  const { width, height } = useVideoConfig();
  const sq = width / height < 1.2;
  return { width, height, sq, inner: sq ? 960 : 1600 };
}
