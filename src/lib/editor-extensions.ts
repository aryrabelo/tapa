// The editor's plugin slot. Plugins push CodeMirror extensions through the
// registry; this compartment applies them to the live view without recreating it.
import { Compartment, type Extension } from "@codemirror/state";
import { registry } from "@/lib/registry";
import { getEditorView } from "@/lib/editor-view";

const compartment = new Compartment();
let current: Extension[] = [];

registry.subscribeEditorExtensions((exts) => {
  current = exts as Extension[];
  const view = getEditorView();
  if (!view) return;
  view.dispatch({ effects: compartment.reconfigure(current) });
});

/** Drop into the editor's extension list. Starts with whatever plugins already registered. */
export function editorPluginCompartment(): Extension {
  return compartment.of(current);
}
