import { type Module, registry } from "@/lib/registry";

// "What changed": a command (registered eagerly, cheap) that lazily activates
// and shows the panel listing the sentences added and removed since the
// previous version of the open note. "Review changes in the text" shows the
// same changes inside the note, each with Keep and Undo; its code (and
// @codemirror/merge) loads on first use.
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
      id: "changes.review",
      title: "Review changes in the text",
      keybinding: "mod+shift+r",
      run: async (ctx) => {
        if (!ctx.getState().activePath) return;
        // Dynamic on purpose: keeps @codemirror/merge out of the boot and editor chunks.
        const { reviewOpenNote } = await import("./review");
        const outcome = await reviewOpenNote();
        // The list made way for the text; when there is nothing to show in the
        // text, the list says why (no earlier version, or nothing changed).
        if (outcome === "started" && registry.activePanel() === "changes") ctx.hidePanel();
        if (outcome === "nothing") ctx.showPanel("changes");
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
