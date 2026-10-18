import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-[13px] font-medium text-text", className)} {...props} />;
}
