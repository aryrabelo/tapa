import type { Module } from "@/lib/registry";
import { toggleOverlay } from "@/modules/teleprompter/overlay";

// Teleprompter reader plugin: ⌘⇧T (or the right-click "Start teleprompter"
// item when a file is open) opens an auto-scrolling overlay of the active file.
export const teleprompterModule: Module = {
  id: "teleprompter",
  register(reg) {
    reg.command({
      id: "teleprompter.toggle",
      title: "Teleprompter: scroll the document",
      keybinding: "mod+shift+t",
      run: () => void toggleOverlay(),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "teleprompter.toggle",
      label: "Start teleprompter",
      group: "Tools",
      when: (rc) => rc.path !== null,
      run: () => void toggleOverlay(),
    });
  },
};
