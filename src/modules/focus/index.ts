import type { Extension } from "@codemirror/state";
import { getPluginConfigValue, subscribePluginConfig } from "@/lib/plugin-config";
import type { Module } from "@/lib/registry";
import { dimOtherSentences, keepLineCentred } from "./focus";

// Both switches start on: only an explicit "false" turns one off.
function configured(): Extension[] {
  const exts: Extension[] = [];
  if (getPluginConfigValue("focus", "dim") !== "false") exts.push(dimOtherSentences());
  if (getPluginConfigValue("focus", "typewriter") !== "false") exts.push(keepLineCentred());
  return exts;
}

// Focus mode, opt-in like iA Writer's. Turning it on or off as a whole goes
// through Settings (see `toggle` in plugins.ts); this module only handles its
// two switches.
export const focusModule: Module = {
  id: "focus",
  register() {},
  activate(ctx) {
    let off = ctx.registerEditorExtension(configured());
    // Swapping the registered extension reconfigures the editor's plugin
    // compartment, so a switch applies to the open note without recreating it.
    const unsubscribe = subscribePluginConfig((pluginId) => {
      if (pluginId !== "focus") return;
      off();
      off = ctx.registerEditorExtension(configured());
    });
    ctx.onDispose(unsubscribe);
  },
};
