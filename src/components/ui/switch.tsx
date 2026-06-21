import type * as React from "react";

import { cn } from "@/lib/utils";

// Dependency-free toggle (no radix: its interactive components render an
// "[object Object]" QName under preact/compat in this app). A native <button>
// gives Space/Enter activation for free; role="switch" + aria-checked carry the
// semantics screen readers need.
export function Switch({
  checked,
  onChange,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "pointer-events-none h-4 w-4 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
