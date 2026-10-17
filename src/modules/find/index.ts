import type { Module } from "@/lib/registry";

// In-document find (⌘F): searches the open note and selects each match in the
// editor. App renders the FindBar by active-panel id (like search).
export const findModule: Module = {
  id: "find",
  register(reg) {
    reg.command({
      id: "find.open",
      title: "Find in file",
      keybinding: "mod+f",
      run: (ctx) => {
        const s = ctx.getState();
        if (s.activePath) ctx.showPanel("find");
      },
    });
    reg.command({
      id: "find.close",
      title: "Close find",
      run: (ctx) => ctx.hidePanel(),
    });
  },
  activate() {},
};
