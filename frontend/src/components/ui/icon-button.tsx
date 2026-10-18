import { cn } from "@/lib/cn";

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export function IconButton({ label, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
