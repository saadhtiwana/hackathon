import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "quiet" | "signal" | "ghost";
  size?: "md" | "sm";
  asChild?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border border-transparent font-medium whitespace-nowrap transition-colors disabled:opacity-50",
        size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]",
        variant === "primary" && "bg-accent text-on-accent hover:bg-accent/90",
        variant === "dark" && "bg-ink text-paper hover:bg-ink/90",
        variant === "quiet" && "border-line bg-surface text-ink hover:bg-wash",
        variant === "signal" && "bg-signal text-on-signal hover:bg-signal/90",
        variant === "ghost" && "bg-transparent text-muted hover:bg-wash hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
