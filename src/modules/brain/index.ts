import type { Module } from "@/lib/registry";
import { captureIdea, openBrain } from "@/modules/brain/brain";

// Brain reader plugin: a default git-backed plain-Markdown ideas vault at
// ~/brain. ⌘⇧B opens it; ⌘⇧I captures a fresh idea into the inbox. Both are
// also exposed as right-click "Tools" menu items.
export const brainModule: Module = {
  id: "brain",
  register(reg) {
    reg.command({
      id: "brain.open",
      title: "Brain: open your ideas vault",
      keybinding: "mod+shift+b",
      run: () => void openBrain(),
    });
    reg.command({
      id: "brain.capture",
      title: "Brain: capture an idea",
      keybinding: "mod+shift+i",
      run: () => void captureIdea(),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "brain.open",
      label: "Open brain",
      group: "Tools",
      run: () => void openBrain(),
    });
    ctx.registerContextMenuItem({
      id: "brain.capture",
      label: "Capture idea",
      group: "Tools",
      run: () => void captureIdea(),
    });
  },
};
