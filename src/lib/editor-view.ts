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

/**
 * Give the keyboard back to the open note after an overlay (find bar, file
 * finder, rename box, settings) closes. In WKWebView, removing the focused
 * field leaves the page with no focus at all, so typing and even menu
 * shortcuts such as ⌘W stop working until the user clicks. Runs now and again
 * on a timer, because WKWebView pauses animation frames while the window is
 * covered.
 */
export function refocusEditor(): void {
  const take = () => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return; // something else took it
    view?.focus();
  };
  take();
  setTimeout(take, 0);
}

/** Focus a field an overlay just rendered: now, and once more after the current task. */
export function focusField(el: HTMLInputElement | null | undefined, select = false): void {
  const take = () => {
    if (!el?.isConnected || document.activeElement === el) return;
    el.focus();
    if (select) el.select();
  };
  take();
  setTimeout(take, 0);
}
