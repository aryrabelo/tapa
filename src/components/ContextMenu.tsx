import type * as React from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { closeMenu, getMenuState, runMenuItem, subscribeMenu } from "@/lib/context-menu";
import type { ContextMenuItem } from "@/lib/registry";
import { cn } from "@/lib/utils";

// Group items by their optional `group`, preserving contribution order across
// groups and within each group.
function groupItems(items: ContextMenuItem[]): [string, ContextMenuItem[]][] {
  const order: string[] = [];
  const byGroup = new Map<string, ContextMenuItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(item);
    else {
      byGroup.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => [key, byGroup.get(key) ?? []]);
}

function MenuGroup({
  label,
  items,
  divided,
}: {
  label: string;
  items: ContextMenuItem[];
  divided: boolean;
}): React.ReactElement {
  return (
    <div className={cn(divided && "mt-1 border-t pt-1")}>
      {label && (
        <div className="px-2 py-1 font-sans text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
          onClick={() => runMenuItem(item)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// The in-app right-click menu. State lives in the context-menu controller (a
// plain external store) so the non-React contextmenu handler can drive it; this
// component just renders the open menu and dismisses on outside-click / Esc.
export function ContextMenu(): React.ReactElement | null {
  const state = useSyncExternalStore(subscribeMenu, getMenuState, getMenuState);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    // Capture-phase mousedown dismisses before the click lands elsewhere.
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.open]);

  if (!state.open) return null;
  const groups = groupItems(state.items);
  // Clamp horizontally to the max width so the menu never spills off-screen.
  const left = Math.min(state.x, window.innerWidth - 288);
  return (
    <div
      ref={ref}
      data-tapa-context-menu=""
      role="menu"
      className="fixed z-50 max-h-[70vh] min-w-44 max-w-72 overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/5"
      style={{ left: Math.max(8, left), top: state.y }}
    >
      {groups.map(([label, items], i) => (
        <MenuGroup key={label || `g${i}`} label={label} items={items} divided={i > 0} />
      ))}
    </div>
  );
}
