import type * as React from "react";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

// ⌘ / ⌥ glyphs keep the list compact; the label describes each binding.
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘K", label: "Jump to file" },
  { keys: "⌘F", label: "Find in file" },
  { keys: "⌘⇧F", label: "Search contents" },
  { keys: "⌘B", label: "Toggle sidebar" },
  { keys: "⌘S", label: "Save" },
  { keys: "⌘⇧L", label: "Live-write" },
  { keys: "⌘⇧P", label: "Presentation" },
  { keys: "⌘,", label: "Settings" },
];

// Plain-div modal (no radix Dialog: the unified `radix-ui` Dialog renders an
// "[object Object]" QName under preact/compat in this app). The backdrop is a
// real <button> so click + keyboard close are native and a11y-clean; Esc also
// closes via the document listener.
export function SettingsPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
    >
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        className="absolute inset-0 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl bg-popover p-5 text-popover-foreground shadow-md ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="mb-4 text-xs text-muted-foreground">Appearance and keyboard shortcuts.</p>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Theme</h3>
            <div className="flex gap-2">
              {THEME_OPTIONS.map(({ value, label, Icon }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={theme === value ? "default" : "outline"}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Keyboard shortcuts</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {SHORTCUTS.map(({ keys, label }) => (
                <li key={keys} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-muted-foreground">
            Agent access (MCP): the tapa-mcp server exposes this vault to coding agents over stdio.
          </p>
        </div>
      </div>
    </div>
  );
}
