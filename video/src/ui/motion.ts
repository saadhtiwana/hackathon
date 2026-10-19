import { Easing, interpolate } from "remotion";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

// 0 → 1 between two frames, eased, clamped.
export function prog(frame: number, from: number, to: number, easing = ease) {
  return interpolate(frame, [from, to], [0, 1], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
