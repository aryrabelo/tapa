import type * as React from "react";
import { Button } from "@/components/ui/button";
import { PanelLeft, Settings } from "@/components/ui/icons";
import { registry } from "@/lib/registry";
import { HeaderPath } from "@/modules/files/HeaderPath";
import { splitPath } from "@/modules/files/path";
import { useStore } from "@/state/store";

// Top bar: sidebar toggle, where the open note lives, save status, Settings.
export function AppHeader(): React.ReactElement {
  const s = useStore();
  // Strip the root's trailing separator so a note in "/" reads "/a.md", not "//a.md".
  const notePath =
    s.root && s.activePath ? `${s.root.replace(/[\\/]+$/, "")}/${s.activePath}` : null;
  let status: string | null = null;
  if (s.activePath) {
    if (s.saving || (s.dirty && !s.saveFailed)) status = "Saving…";
    else status = s.dirty ? "Not saved" : "Saved";
  }

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={s.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          title={s.sidebarOpen ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
          onClick={() => s.setSidebarOpen(!s.sidebarOpen)}
        >
          <PanelLeft className="size-4" />
        </Button>
        {notePath ? (
          <HeaderPath path={notePath} />
        ) : (
          <span className="truncate text-sm font-medium text-foreground">
            {s.root && !s.single ? splitPath(s.root.replace(/[\\/]+$/, "")).name : "Tapa"}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {status && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {status}
          </span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Settings"
          title="Settings (⌘,)"
          onClick={() => void registry.runCommand("settings.open")}
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  );
}
