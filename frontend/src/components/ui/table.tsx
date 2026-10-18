"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/icon-button";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
};

export function Table<T>({
  columns,
  rows,
  rowKey,
  pageSize = 8,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  caption: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState(0);

  const sorted = useMemo(() => {
    const column = columns.find((item) => item.key === sortKey && item.sortValue);
    if (!column?.sortValue) return rows;
    const copy = [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });
    return direction === "asc" ? copy : copy.reverse();
  }, [columns, direction, rows, sortKey]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function onKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(visible.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    }
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-paper">
          <tr className="h-9 border-b border-line text-[12px] text-muted">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn("px-3 font-medium", column.align === "right" && "text-right")}>
                {column.sortValue ? (
                  <button
                    type="button"
                    className="uppercase tracking-wide"
                    onClick={() => {
                      if (sortKey === column.key) setDirection((value) => (value === "asc" ? "desc" : "asc"));
                      else {
                        setSortKey(column.key);
                        setDirection("asc");
                      }
                    }}
                  >
                    {column.header}
                    {sortKey === column.key ? (direction === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ) : (
                  <span className="uppercase tracking-wide">{column.header}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody tabIndex={0} onKeyDown={onKeyDown} aria-label={caption}>
          {visible.map((row, index) => (
            <tr
              key={rowKey(row)}
              className={cn("h-9 border-b border-line last:border-b-0", index === active && "bg-surface")}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn("px-3 text-[13px]", column.align === "right" && "text-right")}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex h-9 items-center justify-between border-t border-line px-3 text-[12px] text-muted">
        <span className="font-mono tabular-nums">
          {safePage + 1} / {pages}
        </span>
        <span className="flex gap-1">
          <IconButton label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Next page" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
            <ChevronRight className="size-4" />
          </IconButton>
        </span>
      </div>
    </div>
  );
}
