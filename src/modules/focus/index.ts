import type { Extension } from "@codemirror/state";
import { getPluginConfigValue, subscribePluginConfig } from "@/lib/plugin-config";
import type { Disposer, Module } from "@/lib/registry";
import { dimOtherSentences, keepLineCentred } from "./focus";

// One extension per switch in Settings, keyed by its config field.
const SWITCHES: Record<string, () => Extension> = {
  dim: dimOtherSentences,
  typewriter: keepLineCentred,
};

// Focus mode, opt-in like iA Writer's. Turning it on or off as a whole goes
// through Settings (see `toggle` in plugins.ts); this module only handles its
// two switches.
export const focusModule: Module = {
  id: "focus",
  register() {},
  activate(ctx) {
    const offs: Record<string, Disposer | undefined> = {};
    // Both switches start on: only an explicit "false" turns one off.
    const apply = (key: string) => {
      offs[key]?.();
      offs[key] = undefined;
      if (getPluginConfigValue("focus", key) !== "false") {
        offs[key] = ctx.registerEditorExtension(SWITCHES[key]());
      }
    };
    for (const key of Object.keys(SWITCHES)) apply(key);
    // Swapping a registered extension reconfigures the editor's plugin
    // compartment, so a switch applies to the open note without recreating it.
    // Only the switch that changed is swapped: taking the other one out and
    // back in would re-run its start-up work, re-centring the note.
    const unsubscribe = subscribePluginConfig((pluginId, key) => {
      if (pluginId === "focus" && key in SWITCHES) apply(key);
    });
    ctx.onDispose(unsubscribe);
  },
};
