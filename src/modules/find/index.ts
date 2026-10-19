import type { Module } from "@/lib/registry";
import { setReplaceOpen } from "./mode";

// In-document find (⌘F) and find-and-replace (⌘⌥F): searches the open note
// and selects each match in the editor. App renders the FindBar by
// active-panel id (like search).
export const findModule: Module = {
  id: "find",
  register(reg) {
    reg.command({
      id: "find.open",
      title: "Find in file",
      run: (ctx) => {
        if (!ctx.getState().activePath) return;
        setReplaceOpen(false);
        ctx.showPanel("find");
      },
    });
    // ⌘F and ⌘⌥F come from the native menu accelerators, so no JS keybindings.
    reg.command({
      id: "find.replace",
      title: "Find and replace",
      run: (ctx) => {
        if (!ctx.getState().activePath) return;
        setReplaceOpen(true);
        ctx.showPanel("find");
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
