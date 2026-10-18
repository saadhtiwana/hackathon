"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] animate-fade-in" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(288px,86vw)] flex-col border-r border-border bg-canvas p-3 animate-fade-in">
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
