import type { Module } from "@/lib/registry";

// Settings is a ⌘, command (registered eagerly, cheap) that lazily activates
// and shows a modal panel. It reuses the existing panel/command primitives.
export const settingsModule: Module = {
  id: "settings",
  register(reg) {
    reg.command({
      id: "settings.open",
      title: "Settings",
      keybinding: "mod+,",
      run: (ctx) => ctx.showPanel("settings"),
    });
    reg.command({
      id: "settings.close",
      title: "Close settings",
      run: (ctx) => ctx.hidePanel(),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "settings.open",
      label: "Settings",
      group: "App",
      run: () => ctx.showPanel("settings"),
    });
    ctx.registerPanel({
      id: "settings",
      slot: "modal",
      load: () => import("./SettingsPanel").then((m) => ({ default: m.SettingsPanel })),
    });
  },
};
