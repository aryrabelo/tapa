import type { Module } from "@/lib/registry";

// Search is the first module: a ⌘⇧F command (registered eagerly, cheap) that
// lazily activates and shows the overlay panel. It invents no new primitive.
export const searchModule: Module = {
  id: "search",
  register(reg) {
    reg.command({
      id: "search.open",
      title: "Search in files",
      keybinding: "mod+shift+f",
      run: (ctx) => ctx.showPanel("search"),
    });
    reg.command({
      id: "search.close",
      title: "Close search",
      run: (ctx) => ctx.hidePanel(),
    });
  },
  activate(ctx) {
    ctx.registerPanel({
      id: "search",
      slot: "modal",
      load: () => import("./SearchPanel").then((m) => ({ default: m.SearchPanel })),
    });
  },
};
