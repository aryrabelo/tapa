// Optional feature plugins the user can turn on/off in Settings. `id` must match
// the Module.id registered in App.tsx; the registry gates a disabled plugin's
// commands, keybindings, and context-menu items. Core plugins (search, find,
// settings, updater, default-handler) are not listed here — they are always on.
export interface PluginInfo {
  id: string;
  label: string;
  keys?: string; // shortcut glyphs, for display only
}

export const TOGGLEABLE_PLUGINS: readonly PluginInfo[] = [
  { id: "teleprompter", label: "Teleprompter", keys: "⌘⇧T" },
  { id: "presentation", label: "Presentation", keys: "⌘⇧P" },
  { id: "livewrite", label: "Live-write", keys: "⌘⇧L" },
  { id: "brain", label: "Brain", keys: "⌘⇧B" },
];

const STORAGE_KEY = "tapa-disabled-plugins";

/** Ids of plugins the user has turned off (persisted). Enabled is the default. */
export function getDisabledPlugins(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Persist a single plugin's disabled state. */
export function setPluginDisabled(id: string, disabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  const set = getDisabledPlugins();
  if (disabled) set.add(id);
  else set.delete(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}
