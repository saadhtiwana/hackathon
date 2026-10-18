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
      <div className="fixed right-4 bottom-4 z-50 flex w-[min(340px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 text-[13px] shadow-raised animate-toast-in",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                item.tone === "signal" && "bg-danger",
                item.tone === "ok" && "bg-status-available",
                item.tone === "neutral" && "bg-accent",
              )}
            />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
