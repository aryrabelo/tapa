// Reader right-click handling. The native WKWebView menu is suppressed in the
// reader and replaced by an in-app, module-extensible menu built from
// registry-contributed items. Native menus are kept in editable fields (search
// inputs, the CodeMirror editor) so copy/paste still works. When no module
// contributes an applicable item, we fall back to just blocking the bare menu.
import { registry, type ContextMenuItem, type ReaderContext } from "@/lib/registry";
import { nearestSourceSpan } from "@/lib/source-map";
import { useStore } from "@/state/store";

const EDITABLE = "input, textarea, [contenteditable]:not([contenteditable='false'])";
const READER = "[data-reader]";

// --- in-app menu state (a tiny external store consumed by <ContextMenu/>) ---
export interface MenuState {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  ctx: ReaderContext | null;
}

let state: MenuState = { open: false, x: 0, y: 0, items: [], ctx: null };
const subs = new Set<() => void>();
const emitChange = () => {
  for (const cb of subs) cb();
};

export function subscribeMenu(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function getMenuState(): MenuState {
  return state;
}

export function closeMenu(): void {
  if (!state.open) return;
  state = { open: false, x: 0, y: 0, items: [], ctx: null };
  emitChange();
}

function openMenu(x: number, y: number, items: ContextMenuItem[], ctx: ReaderContext): void {
  state = { open: true, x, y, items, ctx };
  emitChange();
}

// Run a menu item against the captured reader context, then dismiss.
export function runMenuItem(item: ContextMenuItem): void {
  const { ctx } = state;
  closeMenu();
  if (ctx) item.run(ctx);
}

// 1-based source line for an offset. Allocation-free; a right-click is rare so
// the linear scan is cheaper than slicing/splitting the document.
function offsetToLine(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function buildReaderContext(target: Element): ReaderContext {
  const { activePath, content } = useStore.getState();
  const span = nearestSourceSpan(target);
  const sourceOffset = span ? span.soStart : null;
  const line = sourceOffset != null ? offsetToLine(content, sourceOffset) : null;
  const selection = window.getSelection()?.toString() ?? "";
  return { element: target, sourceOffset, line, selection, path: activePath };
}

export function handleContextMenu(e: MouseEvent): void {
  const target = e.target as Element | null;
  // Keep the native menu in editors/inputs so copy/paste/spellcheck work.
  if (!target || target.closest(EDITABLE)) return;
  e.preventDefault();
  // Outside the reader (header, empty state) there is nothing to contribute —
  // preserve the long-standing "just block the bare menu" behavior.
  if (!target.closest(READER)) {
    closeMenu();
    return;
  }
  const ctx = buildReaderContext(target);
  registry.emit("contextmenu", ctx);
  const items = registry.contextMenuItems(ctx);
  if (items.length === 0) {
    closeMenu();
    return;
  }
  openMenu(e.clientX, e.clientY, items, ctx);
}

export function installContextMenuBlocker(): void {
  window.addEventListener("contextmenu", handleContextMenu);
}
