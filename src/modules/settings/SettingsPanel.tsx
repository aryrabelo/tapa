import type * as React from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/state/store";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";
import { Switch } from "@/components/ui/switch";
import {
  isPluginEnabled,
  setPluginRunning,
  subscribePluginEnabled,
  toggleablePlugins,
} from "@/lib/plugins";
import { getPluginConfigValue, setPluginConfigValue } from "@/lib/plugin-config";
import { pickFolder } from "@/lib/tauri";
import { refocusEditor } from "@/lib/editor-view";
import { AiSettings } from "./AiSettings";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

// Core shortcuts. A plugin's shortcut is appended while that plugin is on, and
// always for a plugin with its own toggle key, since that key works while off.
const CORE_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘K", label: "Jump to file" },
  { keys: "⌘O", label: "Open" },
  { keys: "⌘⇧O", label: "Open Folder" },
  { keys: "⌘S", label: "Save" },
  { keys: "⌘⇧S", label: "Save As" },
  { keys: "⌘W", label: "Close Note" },
  { keys: "⌘F", label: "Find in file" },
  { keys: "⌘⌥F", label: "Find and Replace" },
  { keys: "⌘⇧F", label: "Search contents" },
  { keys: "⌘B", label: "Toggle sidebar" },
  { keys: "⌘= / ⌘- / ⌘0", label: "Text size" },
  { keys: "⌘,", label: "Settings" },
];

// Which optional plugins are on, as a value that changes exactly when one is
// switched. Compared by value, so it is a stable store snapshot.
const enabledSnapshot = () =>
  toggleablePlugins()
    .map((p) => isPluginEnabled(p.id))
    .join();

function Code({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted px-2.5 py-1.5 font-mono text-[0.72rem] leading-relaxed text-foreground/90 select-text">
      {children}
    </pre>
  );
}

// Plain-div modal (no radix Dialog: the unified `radix-ui` Dialog renders an
// "[object Object]" QName under preact/compat in this app). The backdrop is a
// real <button> so click + keyboard close are native and a11y-clean; Esc also
// closes via the document listener.
export function SettingsPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  // Pre-fill the real vault path into the MCP commands when a folder is open.
  const vault = useStore((s) => s.root) ?? "/path/to/your/vault";
  // ⌘⇧D and friends flip a plugin while this panel is open; reading the
  // choice through a store keeps each switch true to it, so the next click
  // does not undo the key. It also keys each row, remounting it on a change.
  const pluginRev = useSyncExternalStore(subscribePluginEnabled, enabledSnapshot);
  const plugins = toggleablePlugins();
  // Per-plugin config values, keyed `${pluginId}::${key}`, seeded from persistence.
  const [cfg, setCfg] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of plugins) {
      for (const field of p.config ?? []) {
        init[`${p.id}::${field.key}`] = getPluginConfigValue(p.id, field.key) ?? "";
      }
    }
    return init;
  });

  const updateCfg = (pluginId: string, key: string, value: string) => {
    setPluginConfigValue(pluginId, key, value);
    setCfg((prev) => ({ ...prev, [`${pluginId}::${key}`]: value }));
  };

  const togglePlugin = (id: string) => {
    void setPluginRunning(id, !isPluginEnabled(id));
  };

  const shortcuts = [
    ...CORE_SHORTCUTS,
    ...plugins
      // A plugin with its own toggle key works while off, so it is listed then too.
      .filter((p) => p.keys && (p.toggle || isPluginEnabled(p.id)))
      .map((p) => ({ keys: p.keys as string, label: p.label ?? p.id })),
  ];

  // Closing hands the keyboard back to the note.
  useEffect(() => refocusEditor, []);

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
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
    >
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        className="absolute inset-0 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-popover p-5 text-popover-foreground shadow-md ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Appearance, shortcuts, and agent access.
        </p>

        <div className="flex flex-col gap-6">
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
              {shortcuts.map(({ keys, label }) => (
                <li key={keys} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Plugins</h3>
            <p className="text-xs text-muted-foreground">Turn optional features on or off.</p>
            <ul className="flex flex-col gap-3 text-sm">
              {plugins.map(({ id, label, keys, config, blurb }) => {
                const enabled = isPluginEnabled(id);
                return (
                  <li key={`${id}-${pluginRev}`} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {label}
                        {keys ? (
                          <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                            {keys}
                          </kbd>
                        ) : null}
                      </span>
                      <Switch
                        checked={enabled}
                        onChange={() => togglePlugin(id)}
                        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
                      />
                    </div>
                    {blurb ? (
                      <p className="text-[0.7rem] leading-relaxed text-muted-foreground">{blurb}</p>
                    ) : null}
                    {enabled && config?.length ? (
                      <div className="mt-1 flex flex-col gap-2 pl-1">
                        {config.map((field) => {
                          const fieldId = `plugin-cfg-${id}-${field.key}`;
                          const value = cfg[`${id}::${field.key}`] ?? "";
                          if (field.type === "toggle") {
                            return (
                              <div
                                key={field.key}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="text-xs font-medium text-foreground">
                                  {field.label}
                                </span>
                                <Switch
                                  checked={value !== "false"}
                                  onChange={(next) => updateCfg(id, field.key, String(next))}
                                  aria-label={field.label}
                                />
                              </div>
                            );
                          }
                          return (
                            <div key={field.key} className="flex flex-col gap-1">
                              <label
                                htmlFor={fieldId}
                                className="text-xs font-medium text-foreground"
                              >
                                {field.label}
                              </label>
                              {field.help ? (
                                <p className="text-[0.7rem] text-muted-foreground">{field.help}</p>
                              ) : null}
                              {field.type === "dir" ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    id={fieldId}
                                    value={value}
                                    placeholder={field.placeholder}
                                    onChange={(e) =>
                                      updateCfg(id, field.key, e.currentTarget.value)
                                    }
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    aria-label={`Browse for ${field.label}`}
                                    onClick={async () => {
                                      const p = await pickFolder();
                                      if (p) updateCfg(id, field.key, p);
                                    }}
                                  >
                                    Browse…
                                  </Button>
                                </div>
                              ) : (
                                <Input
                                  id={fieldId}
                                  value={value}
                                  placeholder={field.placeholder}
                                  onChange={(e) => updateCfg(id, field.key, e.currentTarget.value)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <AiSettings />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Agent access (MCP)</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tapa ships an optional <code className="font-mono">tapa-mcp</code> server that exposes
              this vault to a coding agent (Claude Code, Cursor, …) over stdio — read, search, and
              live file subscriptions, plus write with <code className="font-mono">--write</code>.
              It is a separate binary, not bundled, so the reader stays ~5&nbsp;MB.
            </p>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">1. Build it once</span>
              <Code>cd src-tauri &amp;&amp; cargo build --release --bin tapa-mcp</Code>
              <span className="text-[0.7rem] text-muted-foreground">
                Output: <code className="font-mono">src-tauri/target/release/tapa-mcp</code>
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">2. Register it with Claude Code</span>
              <Code>{`claude mcp add tapa -- \\\n  /abs/path/to/tapa-mcp \\\n  ${vault}`}</Code>
              <span className="text-[0.7rem] text-muted-foreground">
                Add <code className="font-mono">--write</code> at the end for append / patch /
                focus; omit it for read-only.
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">3. Or Claude Desktop</span>
              <span className="text-[0.7rem] text-muted-foreground">
                Add the same command under <code className="font-mono">mcpServers.tapa</code> in
                <code className="font-mono"> claude_desktop_config.json</code>:
              </span>
              <Code>{`{
  "mcpServers": {
    "tapa": {
      "command": "/abs/path/to/tapa-mcp",
      "args": ["${vault}"]
    }
  }
}`}</Code>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
