"use client";

import { useSyncExternalStore } from "react";

// Difference between the server clock and this browser. The leads API teaches it from ackRemainingSeconds
// next to ackDeadline, so every countdown agrees with the server.
let offsetMs = 0;

export function learnServerClock(ackDeadline: string, remainingSeconds: number) {
  if (remainingSeconds <= 0) return; // clamped at zero, carries no clock information
  const serverNow = new Date(ackDeadline).getTime() - remainingSeconds * 1000;
  offsetMs = serverNow - Date.now();
}

// One shared one-second ticker for every countdown on the page.
let now = typeof window === "undefined" ? 0 : Date.now();
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now() + offsetMs;
    timer = window.setInterval(() => {
      now = Date.now() + offsetMs;
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

const snapshot = () => now;
const serverSnapshot = () => 0;

// Server-corrected current time in ms; 0 during server rendering.
export function useServerNow() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function secondsBetween(fromMs: number, to: string) {
  return Math.round((new Date(to).getTime() - fromMs) / 1000);
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
