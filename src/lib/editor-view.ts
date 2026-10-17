// Holds the open editor so find and search can move the caret without importing
// CodeMirror into the app shell. The editor chunk is the only thing that
// constructs the view.
import type { EditorView } from "@codemirror/view";

let view: EditorView | null = null;

export function attachEditorView(next: EditorView | null): void {
  view = next;
}

export function getEditorView(): EditorView | null {
  return view;
}
