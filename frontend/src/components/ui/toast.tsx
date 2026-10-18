"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type ToastItem = {
  id: number;
  message: string;
  tone: "neutral" | "ok" | "signal";
};

const ToastContext = createContext<(message: string, tone?: ToastItem["tone"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastItem["tone"] = "neutral") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-3 bottom-3 z-50 flex w-[min(320px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "rounded-md border bg-surface px-3 py-2 text-[13px]",
              item.tone === "signal" && "border-signal",
              item.tone === "ok" && "border-ok",
              item.tone === "neutral" && "border-line",
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
