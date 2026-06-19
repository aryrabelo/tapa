import type { Module } from "@/lib/registry";

// In-document find (⌘F): searches the rendered text of the currently open file
// in reader mode and highlights matches via the CSS Custom Highlight API. App
// renders the FindBar by active-panel id (like search), so no panel is
// registered here — only the open/close commands and the highlight styles.
export const findModule: Module = {
  id: "find",
  register(reg) {
    reg.command({
      id: "find.open",
      title: "Find in file",
      keybinding: "mod+f",
      run: (ctx) => {
        const s = ctx.getState();
        if (s.activePath && s.mode === "reader") ctx.showPanel("find");
      },
    });
    reg.command({
      id: "find.close",
      title: "Close find",
      run: (ctx) => ctx.hidePanel(),
    });
  },
  activate(ctx) {
    ctx.registerStyle(
      "::highlight(tapa-find){background-color: rgba(250,204,21,.4);} " +
        "::highlight(tapa-find-current){background-color: rgba(249,115,22,.65); color: inherit;}",
    );
  },
};
