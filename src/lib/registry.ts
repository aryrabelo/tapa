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

export interface ModuleContext {
  registerCommand(cmd: Command): void;
  registerPanel(panel: PanelSpec): void;
  on(event: string, handler: (payload: unknown) => void): Disposer;
  getState: typeof useStore.getState;
  showPanel(id: string): void;
  hidePanel(): void;
  onDispose(cb: Disposer): void;
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
  getPanel(id: string): PanelSpec | undefined;
  activePanel(): string | null;
  subscribePanel(cb: () => void): Disposer;
}

export function createRegistry(): Registry {
  const commands = new Map<string, { cmd: Command; moduleId: string }>();
  const modules = new Map<string, Module>();
  const activated = new Set<string>();
  const disposers = new Map<string, Disposer[]>(); // moduleId -> disposers
  const bus = new Map<string, Set<(p: unknown) => void>>();
  const panels = new Map<string, PanelSpec>();
  let panelId: string | null = null;
  const panelSubs = new Set<() => void>();

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
      if (!entry) return;
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
    getPanel: (id) => panels.get(id),
    activePanel: () => panelId,
    subscribePanel(cb) {
      panelSubs.add(cb);
      return () => {
        panelSubs.delete(cb);
      };
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
