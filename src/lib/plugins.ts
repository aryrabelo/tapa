// Plugin manifest. Core plugins (no `defaultEnabled`) are always on. The rest
// are official plugins the user turns on or off in Settings. Each `load` is a
// dynamic import, so a plugin's code arrives only when it is actually used.
import type { Module } from "@/lib/registry";
import { registry } from "@/lib/registry";

export interface ConfigField {
  key: string;
  label: string;
  /** A toggle is stored as "true"/"false"; unset reads as on. */
  type: "text" | "dir" | "toggle";
  placeholder?: string;
  help?: string;
}

export interface PluginManifest {
  id: string;
  label?: string;
  /** One sentence, for someone who does not write code. */
  blurb?: string;
  keys?: string;
  /** Omitted for core plugins, which are always on and not listed in Settings. */
  defaultEnabled?: boolean;
  /** Loaded with the editor, not at app boot. Keeps the empty screen free of CodeMirror. */
  editor?: boolean;
  /** Activate as soon as the module loads. Otherwise the first command activates it. */
  eager?: boolean;
  /**
   * A command that turns the whole plugin on or off. Settings registers it, not
   * the plugin: a plugin that is off is not loaded and could not switch itself on.
   */
  toggle?: { title: string; keybinding: string };
  config?: ConfigField[];
  load: () => Promise<Module>;
}

export const PLUGINS: readonly PluginManifest[] = [
  { id: "zoom", eager: true, load: () => import("@/modules/zoom").then((m) => m.zoomModule) },
  { id: "files", eager: true, load: () => import("@/modules/files").then((m) => m.filesModule) },
  {
    id: "search",
    load: () => import("@/modules/search").then((m) => m.searchModule),
  },
  {
    id: "find",
    load: () => import("@/modules/find").then((m) => m.findModule),
  },
  {
    id: "settings",
    eager: true,
    load: () => import("@/modules/settings").then((m) => m.settingsModule),
  },
  {
    id: "updater",
    eager: true,
    load: () => import("@/modules/updater").then((m) => m.updaterModule),
  },
  {
    id: "default-handler",
    eager: true,
    load: () => import("@/modules/default-handler").then((m) => m.defaultHandlerModule),
  },
  {
    id: "live-preview",
    label: "Formatted reading",
    blurb: "Hides Markdown symbols so the note reads like a page.",
    defaultEnabled: true,
    editor: true,
    eager: true,
    load: () => import("@/modules/live-preview").then((m) => m.livePreviewModule),
  },
  {
    id: "tables",
    label: "Tables",
    blurb: "Draws tables. Click a cell to edit it.",
    defaultEnabled: true,
    editor: true,
    eager: true,
    load: () => import("@/modules/tables").then((m) => m.tablesModule),
  },
  {
    id: "autocomplete",
    label: "Autocomplete",
    blurb: "Finishes the word in gray from your other notes. Tab keeps it, Esc hides it.",
    defaultEnabled: true,
    editor: true,
    eager: true,
    load: () => import("@/modules/autocomplete").then((m) => m.autocompleteModule),
  },
  {
    id: "focus",
    label: "Focus",
    blurb: "Fades everything but the sentence you are writing and keeps it in the middle.",
    keys: "⌘⇧D",
    defaultEnabled: false,
    editor: true,
    eager: true,
    toggle: { title: "Toggle focus mode", keybinding: "mod+shift+d" },
    config: [
      { key: "dim", label: "Dim other sentences", type: "toggle" },
      { key: "typewriter", label: "Keep the line centred", type: "toggle" },
    ],
    load: () => import("@/modules/focus").then((m) => m.focusModule),
  },
  {
    id: "teleprompter",
    label: "Teleprompter",
    blurb: "Scrolls the note on its own, for recording a video.",
    keys: "⌘⇧T",
    defaultEnabled: false,
    eager: true,
    load: () => import("@/modules/teleprompter").then((m) => m.teleprompterModule),
  },
  {
    id: "brain",
    label: "Brain",
    blurb: "Opens a folder of idea notes.",
    keys: "⌘⇧B",
    defaultEnabled: false,
    eager: true,
    config: [
      {
        key: "dir",
        label: "Vault directory",
        type: "dir",
        placeholder: "~/brain",
        help: "Folder for your ideas. Leave blank to use ~/brain.",
      },
    ],
    load: () => import("@/modules/brain").then((m) => m.brainModule),
  },
  {
    id: "changes",
    label: "What changed",
    blurb:
      "Lists the sentences you added and removed in a note, and lets you keep or undo each change in the text.",
    keys: "⌘⇧G / ⌘⇧R",
    defaultEnabled: true,
    load: () => import("@/modules/changes").then((m) => m.changesModule),
  },
];

const OVERRIDE_KEY = "tapa-plugin-overrides";
const LEGACY_KEY = "tapa-disabled-plugins";

function parseOverrides(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function legacyIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function migrateLegacyDisabled(): void {
  if (localStorage.getItem(OVERRIDE_KEY)) return;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  const migrated: Record<string, boolean> = {};
  for (const id of legacyIds(legacy)) migrated[id] = false;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(migrated));
  localStorage.removeItem(LEGACY_KEY);
}

function readOverrides(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  migrateLegacyDisabled();
  return parseOverrides(localStorage.getItem(OVERRIDE_KEY));
}

function writeOverride(id: string, enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  const overrides = readOverrides();
  overrides[id] = enabled;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
}

/** Core plugins are always on. Others follow the saved choice, then the manifest default. */
export function isPluginEnabled(id: string): boolean {
  const manifest = PLUGINS.find((p) => p.id === id);
  if (!manifest || manifest.defaultEnabled === undefined) return true;
  const overrides = readOverrides();
  if (id in overrides) return overrides[id] === true;
  return manifest.defaultEnabled;
}

export function toggleablePlugins(): PluginManifest[] {
  return PLUGINS.filter((p) => p.defaultEnabled !== undefined);
}

const inflight = new Map<string, Promise<void>>();

function ensureLoaded(manifest: PluginManifest): Promise<void> {
  const existing = inflight.get(manifest.id);
  if (existing) return existing;
  const pending = (async () => {
    const mod = await manifest.load();
    registry.register(mod);
    if (manifest.eager && isPluginEnabled(manifest.id)) registry.setEnabled(manifest.id, true);
  })();
  inflight.set(manifest.id, pending);
  return pending;
}

/** Load core plugins (commands, settings). Editor plugins wait until a note is open. */
export function bootCorePlugins(): Promise<void> {
  return boot("core");
}

/** Load editor plugins (live preview, tables) before the editor is created. */
export function bootEditorPlugins(): Promise<void> {
  return boot("editor");
}

let coreBoot: Promise<void> | null = null;
let editorBoot: Promise<void> | null = null;

function boot(which: "core" | "editor"): Promise<void> {
  const slot = which === "core" ? coreBoot : editorBoot;
  if (slot) return slot;
  const pending = (async () => {
    for (const manifest of PLUGINS) {
      const isEditor = manifest.editor === true;
      if (which === "editor" ? !isEditor : isEditor) continue;
      if (manifest.defaultEnabled !== undefined && !isPluginEnabled(manifest.id)) continue;
      await ensureLoaded(manifest);
    }
  })();
  if (which === "core") coreBoot = pending;
  else editorBoot = pending;
  return pending;
}

const enabledListeners = new Set<() => void>();

/**
 * Called whenever a plugin is switched on or off, from Settings or from a
 * plugin's own toggle key, so an open Settings panel shows the real state.
 */
export function subscribePluginEnabled(cb: () => void): () => void {
  enabledListeners.add(cb);
  return () => {
    enabledListeners.delete(cb);
  };
}

/** Persist the choice and load or tear down the plugin. */
export async function setPluginRunning(id: string, enabled: boolean): Promise<void> {
  const manifest = PLUGINS.find((p) => p.id === id);
  if (!manifest || manifest.defaultEnabled === undefined) return;
  writeOverride(id, enabled);
  for (const cb of enabledListeners) cb();
  if (enabled) {
    await ensureLoaded(manifest);
    // Two quick presses of a toggle key run two calls at once: the second may
    // have switched the plugin off while this one waited for its code. The
    // saved choice is the latest one, so it wins.
    if (isPluginEnabled(id)) registry.setEnabled(id, true);
    return;
  }
  if (inflight.has(id)) registry.setEnabled(id, false);
}
