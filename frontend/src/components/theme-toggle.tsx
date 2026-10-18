"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

function currentDark() {
  const root = document.documentElement;
  return root.classList.contains("dark");
}

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, currentDark, () => false);

  function toggle() {
    const next = !currentDark();
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.classList.toggle("light", !next);
    localStorage.setItem("relay-theme", next ? "dark" : "light");
  }

  return (
    <IconButton label={dark ? "Switch to day desk" : "Switch to night shift"} onClick={toggle}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  );
}
