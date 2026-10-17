import { tableWidgets } from "@/components/editor/table-widget";
import type { Module } from "@/lib/registry";

// Draws GFM tables inside the editor. Clicking a cell drops the caret into
// that table's source; leaving the table draws it again.
export const tablesModule: Module = {
  id: "tables",
  register() {},
  activate(ctx) {
    ctx.registerEditorExtension(tableWidgets);
  },
};
