// Suppress the default webview right-click menu. A custom in-app context menu
// (registry-driven, module-extensible) is a planned later feature; until then we
// just block the bare OS/WKWebView menu in the reader. Native menus are kept in
// editable fields (search inputs, the CodeMirror editor) so copy/paste still works.
const EDITABLE = "input, textarea, [contenteditable]:not([contenteditable='false'])";

export function blockContextMenu(e: MouseEvent): void {
  const target = e.target as Element | null;
  if (target?.closest(EDITABLE)) return;
  e.preventDefault();
}

export function installContextMenuBlocker(): void {
  window.addEventListener("contextmenu", blockContextMenu);
}
