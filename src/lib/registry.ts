import type * as React from "react";
import { useSyncExternalStore } from "react";
import { useStore } from "@/state/store";

export type Disposer = () => void;

export interface Command {
  id: string;
  title: string;
  keybinding?: string; // e.g. "mod+shift+f"
  run: (ctx: ModuleContext) => void | Promise<void>;
}

export interface PanelSpec {
  id: string;
  slot: "sidebar" | "main" | "modal";
  // biome-ignore lint/suspicious/noExplicitAny: panel prop shapes vary per module
  load: () => Promise<{ default: React.ComponentType<any> }>;
}

/** Context for a reader right-click, passed to context-menu items. */
export interface ReaderContext {
  element: Element; // the right-clicked element
  sourceOffset: number | null; // nearest data-so source byte offset
  line: number | null; // 1-based source line of that offset
  selection: string; // current text selection (may be empty)
  path: string | null; // active file path
}

/** A right-click menu entry contributed by a module. */
export interface ContextMenuItem {
  id: string;
  label: string;
  group?: string;
  when?: (ctx: ReaderContext) => boolean;
  run: (ctx: ReaderContext) => void;
}

/** An action button a module contributes to the sidebar's top action bar. */
export interface SidebarAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
  order?: number; // lower sorts first; default 100
}

export interface ModuleContext {
  registerCommand(cmd: Command): void;
  registerPanel(panel: PanelSpec): void;
  on(event: string, handler: (payload: unknown) => void): Disposer;
  getState: typeof useStore.getState;
  showPanel(id: string): void;
  hidePanel(): void;
  onDispose(cb: Disposer): void;
  registerContextMenuItem(item: ContextMenuItem): Disposer;
  registerSidebarAction(action: SidebarAction): Disposer;
  onReaderRender(cb: (container: HTMLElement) => void): Disposer;
  registerStyle(css: string): Disposer;
}

export interface Module {
  id: string;
  register(reg: { command(cmd: Command): void }): void; // eager, cheap
  activate(ctx: ModuleContext): void | Promise<void>; // lazy
}

export interface Registry {
  register(module: Module): void;
  runCommand(id: string): Promise<void>;
  commands(): Command[];
  on(event: string, handler: (payload: unknown) => void): Disposer;
  emit(event: string, payload: unknown): void;
  deactivate(id: string): void;
  setEnabled(id: string, enabled: boolean): void;
  getPanel(id: string): PanelSpec | undefined;
  activePanel(): string | null;
  subscribePanel(cb: () => void): Disposer;
  runKeybinding(e: KeyboardEvent): boolean;
  activate(id: string): Promise<void>;
  contextMenuItems(ctx: ReaderContext): ContextMenuItem[];
  sidebarActions(): SidebarAction[];
  subscribeSidebar(cb: () => void): Disposer;
  emitReaderRender(container: HTMLElement): void;
}

export function createRegistry(): Registry {
  const commands = new Map<string, { cmd: Command; moduleId: string }>();
  const modules = new Map<string, Module>();
  const activated = new Set<string>();
  const disabled = new Set<string>(); // moduleIds the user turned off; gated below
  const disposers = new Map<string, Disposer[]>(); // moduleId -> disposers
  const bus = new Map<string, Set<(p: unknown) => void>>();
  const panels = new Map<string, PanelSpec>();
  let panelId: string | null = null;
  const panelSubs = new Set<() => void>();
  const contextItems = new Map<string, ContextMenuItem>();
  const readerRenderCbs = new Set<(c: HTMLElement) => void>();
  let lastReaderContainer: HTMLElement | null = null;
  const sidebarItems = new Map<string, SidebarAction>();
  const sidebarSubs = new Set<() => void>();
  let sidebarSnapshot: SidebarAction[] = [];

  const record = (moduleId: string, d: Disposer) => {
    const arr = disposers.get(moduleId) ?? [];
    arr.push(d);
    disposers.set(moduleId, arr);
  };

  const on = (event: string, handler: (p: unknown) => void): Disposer => {
    const set = bus.get(event) ?? new Set();
    set.add(handler);
    bus.set(event, set);
    return () => {
      set.delete(handler);
    };
  };

  const emit = (event: string, payload: unknown) => {
    for (const h of bus.get(event) ?? []) h(payload);
  };

  const notifyPanel = () => {
    for (const cb of panelSubs) cb();
  };

  const notifySidebar = () => {
    // Rebuild a stable, order-sorted snapshot so useSyncExternalStore sees an
    // unchanged reference between renders (a fresh array each call would loop).
    sidebarSnapshot = [...sidebarItems.values()].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    );
    for (const cb of sidebarSubs) cb();
  };

  const ctxFor = (moduleId: string): ModuleContext => ({
    registerCommand: (cmd) => {
      commands.set(cmd.id, { cmd, moduleId });
    },
    registerPanel: (panel) => {
      panels.set(panel.id, panel);
      record(moduleId, () => {
        panels.delete(panel.id);
      });
    },
    on: (event, handler) => {
      const off = on(event, handler);
      record(moduleId, off);
      return off;
    },
    getState: useStore.getState,
    showPanel: (id) => {
      panelId = id;
      notifyPanel();
    },
    hidePanel: () => {
      panelId = null;
      notifyPanel();
    },
    onDispose: (cb) => record(moduleId, cb),
    registerContextMenuItem: (item) => {
      contextItems.set(item.id, item);
      const off = () => {
        contextItems.delete(item.id);
      };
      record(moduleId, off);
      return off;
    },
    registerSidebarAction: (action) => {
      sidebarItems.set(action.id, action);
      notifySidebar();
      const off = () => {
        sidebarItems.delete(action.id);
        notifySidebar();
      };
      record(moduleId, off);
      return off;
    },
    onReaderRender: (cb) => {
      readerRenderCbs.add(cb);
      if (lastReaderContainer) cb(lastReaderContainer);
      const off = () => {
        readerRenderCbs.delete(cb);
      };
      record(moduleId, off);
      return off;
    },
    registerStyle: (css) => {
      const el = document.createElement("style");
      el.textContent = css;
      document.head.appendChild(el);
      const off = () => {
        el.remove();
      };
      record(moduleId, off);
      return off;
    },
  });

  const activate = async (moduleId: string) => {
    if (activated.has(moduleId)) return;
    activated.add(moduleId);
    const mod = modules.get(moduleId);
    if (mod) await mod.activate(ctxFor(moduleId));
  };

  return {
    register(module) {
      modules.set(module.id, module);
      module.register({
        command: (cmd) => {
          commands.set(cmd.id, { cmd, moduleId: module.id });
        },
      });
    },
    async runCommand(id) {
      const entry = commands.get(id);
      if (!entry || disabled.has(entry.moduleId)) return;
      await activate(entry.moduleId);
      await entry.cmd.run(ctxFor(entry.moduleId));
    },
    commands: () => [...commands.values()].map((e) => e.cmd),
    on,
    emit,
    deactivate(id) {
      for (const d of disposers.get(id) ?? []) d();
      disposers.delete(id);
      activated.delete(id);
    },
    setEnabled(id, enabled) {
      if (enabled) {
        disabled.delete(id);
        void activate(id);
        return;
      }
      // Disable = mark gated + tear down what activate() registered (context
      // items, styles, listeners). Eagerly-registered commands stay in the map
      // but are skipped by runCommand/runKeybinding via the disabled set.
      disabled.add(id);
      for (const d of disposers.get(id) ?? []) d();
      disposers.delete(id);
      activated.delete(id);
    },
    getPanel: (id) => panels.get(id),
    activePanel: () => panelId,
    subscribePanel(cb) {
      panelSubs.add(cb);
      return () => {
        panelSubs.delete(cb);
      };
    },
    runKeybinding(e) {
      for (const entry of commands.values()) {
        if (
          entry.cmd.keybinding &&
          !disabled.has(entry.moduleId) &&
          matchesBinding(entry.cmd.keybinding, e)
        ) {
          void (async () => {
            await activate(entry.moduleId);
            await entry.cmd.run(ctxFor(entry.moduleId));
          })();
          return true;
        }
      }
      return false;
    },
    activate,
    contextMenuItems: (rctx) =>
      [...contextItems.values()].filter((it) => !it.when || it.when(rctx)),
    sidebarActions: () => sidebarSnapshot,
    subscribeSidebar(cb) {
      sidebarSubs.add(cb);
      return () => {
        sidebarSubs.delete(cb);
      };
    },
    emitReaderRender(container) {
      lastReaderContainer = container;
      for (const cb of readerRenderCbs) cb(container);
    },
  };
}

/** App-wide singleton. */
export const registry = createRegistry();

/** React hook: id of the currently shown panel (or null). */
export function useActivePanel(): string | null {
  return useSyncExternalStore(
    (cb) => registry.subscribePanel(cb),
    () => registry.activePanel(),
    () => registry.activePanel(),
  );
}

/** React hook: the sidebar actions modules have contributed (order-sorted). */
export function useSidebarActions(): SidebarAction[] {
  return useSyncExternalStore(
    (cb) => registry.subscribeSidebar(cb),
    () => registry.sidebarActions(),
    () => registry.sidebarActions(),
  );
}

// Pure: does a "mod+shift+key" binding match this keydown? `mod` = ⌘ or Ctrl.
// A modifier absent from the binding must be absent from the event, so "mod+k"
// does not fire on ⌘⇧K. Powers the single app-wide keybinding dispatcher.
export function matchesBinding(binding: string, e: KeyboardEvent): boolean {
  const parts = binding.toLowerCase().split("+");
  const key = parts.at(-1);
  if (!key) return false;
  const wantMod = parts.includes("mod");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  return (
    (e.metaKey || e.ctrlKey) === wantMod &&
    e.shiftKey === wantShift &&
    e.altKey === wantAlt &&
    e.key.toLowerCase() === key
  );
}
