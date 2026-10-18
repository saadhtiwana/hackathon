"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import type { Me } from "@/lib/api";
import { can } from "@/lib/permissions";
import { paletteItems } from "@/components/shell/nav";

export function CommandPalette({
  open,
  onOpenChange,
  me,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: Me;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  const items = paletteItems.filter((item) => can(me, item.permission));

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Jump to a page"
      className="fixed top-[18%] left-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 rounded-md border border-line bg-surface"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Jump to a page"
        className="h-11 w-full border-b border-line bg-transparent px-3 text-[14px] outline-none"
      />
      <Command.List className="max-h-72 overflow-auto p-1">
        <Command.Empty className="px-3 py-4 text-[13px] text-muted">No pages match.</Command.Empty>
        {items.map((item) => (
          <Command.Item
            key={item.href}
            value={item.label}
            onSelect={() => {
              router.push(item.href);
              onOpenChange(false);
              setQuery("");
            }}
            className="flex h-9 cursor-pointer items-center rounded-sm px-2 text-[13px] data-[selected=true]:bg-paper"
          >
            {item.label}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
