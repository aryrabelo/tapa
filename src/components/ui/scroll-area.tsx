import type * as React from "react";
import { cn } from "@/lib/utils";

// Native overflow scroller. Replaces the radix ScrollArea: radix's Slot/asChild
// cloning is incompatible with preact/compat (it stringifies the component type
// into createElement -> "[object Object]" QName error), and a native scroller is
// lighter and matches the OS overlay scrollbar this app wants.
function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-slot="scroll-area" className={cn("relative overflow-auto", className)} {...props}>
      {children}
    </div>
  );
}

export { ScrollArea };
