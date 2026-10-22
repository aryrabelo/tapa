import type { Module } from "@/lib/registry";

// "What changed": a command (registered eagerly, cheap) that lazily activates
// and shows the panel listing the sentences added and removed since the
// previous version of the open note.
export const changesModule: Module = {
  id: "changes",
  register(reg) {
    reg.command({
      id: "changes.open",
      title: "Show what changed",
      keybinding: "mod+shift+g",
      run: (ctx) => {
        if (!ctx.getState().activePath) return;
        ctx.showPanel("changes");
      },
    });
    reg.command({
      id: "changes.close",
      title: "Close what changed",
      run: (ctx) => ctx.hidePanel(),
    });
  },
  activate(ctx) {
    ctx.registerPanel({
      id: "changes",
      slot: "modal",
      load: () => import("./ChangesPanel").then((m) => ({ default: m.ChangesPanel })),
    });
  },
};
