// Tab / Shift-Tab, for people, not programmers: nest or un-nest a list item,
// indent inside a fenced code block, or simply stay put everywhere else (a
// paragraph never turns into a code block by four spaces of Tab).
import { syntaxTree } from "@codemirror/language";
import type { ChangeSpec, EditorState, Text } from "@codemirror/state";
import type { Command, KeyBinding } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

const LIST_MARKER = /^(?:[-*+]|\d+[.)])(?=\s)/;

/** Nearest `ListItem` enclosing `pos`, or null outside any list. */
function enclosingListItem(state: EditorState, pos: number, side: -1 | 1 = 1): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
  for (; node; node = node.parent) {
    if (node.name === "ListItem") return node;
  }
  return null;
}

/**
 * Distinct `ListItem`s touched by the selection, keeping only the ones whose
 * own ancestor chain is not itself in the set — an item nested inside
 * another touched item moves with it (its whole subtree shifts together), so
 * it must not also be shifted on its own.
 */
function selectedListItems(state: EditorState): SyntaxNode[] {
  const byStart = new Map<number, SyntaxNode>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      const item = enclosingListItem(state, state.doc.line(n).to, -1);
      if (item) byStart.set(item.from, item);
    }
  }
  const all = [...byStart.values()];
  return all.filter((item) => !all.some((other) => other.from < item.from && item.to <= other.to));
}

/** Column (character count) of `pos` within its own line. */
function column(doc: Text, pos: number): number {
  return pos - doc.lineAt(pos).from;
}

/**
 * How far to shift `item` right to make it a child of the list item directly
 * above it at the same indentation — that item's content column (its own
 * indentation, plus its marker, plus the one mandatory space). Returns null
 * when there is no such item (first item of a list, or already the first
 * child): Tab then changes nothing for this item.
 */
function nestDelta(doc: Text, item: SyntaxNode): number | null {
  const itemLine = doc.lineAt(item.from);
  const currentIndent = column(doc, item.from);
  for (let n = itemLine.number - 1; n >= 1; n--) {
    const line = doc.line(n);
    if (line.text.trim() === "") continue;
    const indent = line.text.length - line.text.trimStart().length;
    if (indent < currentIndent) return null; // escaped past any sibling
    if (indent > currentIndent) continue; // a deeper line: some item's subtree
    const marker = LIST_MARKER.exec(line.text.slice(indent));
    if (!marker) return null; // same column, but not a list item: not a sibling
    return indent + marker[0].length + 1 - currentIndent;
  }
  return null;
}

/**
 * How far to shift `item` left to match its parent list item's indentation.
 * Returns null for a top-level item (no enclosing list item): Shift-Tab then
 * changes nothing.
 */
function unnestDelta(doc: Text, item: SyntaxNode): number | null {
  const list = item.parent;
  const ancestor = list?.parent;
  if (ancestor?.name !== "ListItem") return null;
  const ancestorIndent = column(doc, ancestor.from);
  const currentIndent = column(doc, item.from);
  return ancestorIndent - currentIndent;
}

/** Shift every non-blank line of `item`'s whole span (it and its subtree) by `delta` columns. */
function shiftItem(doc: Text, item: SyntaxNode, delta: number, changes: ChangeSpec[]): void {
  const firstLine = doc.lineAt(item.from).number;
  const lastLine = doc.lineAt(item.to).number;
  for (let n = firstLine; n <= lastLine; n++) {
    const line = doc.line(n);
    if (line.text.trim() === "") continue;
    if (delta > 0) {
      changes.push({ from: line.from, insert: " ".repeat(delta) });
    } else {
      const leading = line.text.length - line.text.trimStart().length;
      const remove = Math.min(-delta, leading);
      if (remove > 0) changes.push({ from: line.from, to: line.from + remove });
    }
  }
}

function applyListIndent(items: SyntaxNode[], state: EditorState, nest: boolean): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  for (const item of items) {
    const delta = nest ? nestDelta(state.doc, item) : unnestDelta(state.doc, item);
    if (delta) shiftItem(state.doc, item, delta, changes);
  }
  return changes;
}

/** Is `pos` inside a fenced code block? */
function inFencedCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; node; node = node.parent) {
    if (node.name === "FencedCode") return true;
  }
  return false;
}

function codeIndentMore(state: EditorState): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    if (range.empty) {
      changes.push({ from: range.from, insert: "  " });
      continue;
    }
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      changes.push({ from: state.doc.line(n).from, insert: "  " });
    }
  }
  return changes;
}

function codeIndentLess(state: EditorState): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) lines.add(n);
  }
  for (const n of lines) {
    const line = state.doc.line(n);
    const leading = line.text.length - line.text.trimStart().length;
    const remove = Math.min(2, leading);
    if (remove > 0) changes.push({ from: line.from, to: line.from + remove });
  }
  return changes;
}

function run(view: Parameters<Command>[0], nest: boolean): boolean {
  const { state } = view;
  const items = selectedListItems(state);
  const changes = items.length
    ? applyListIndent(items, state, nest)
    : inFencedCode(state, state.selection.main.head)
      ? nest
        ? codeIndentMore(state)
        : codeIndentLess(state)
      : [];
  if (changes.length) {
    const changeSet = state.changes(changes);
    view.dispatch({
      changes,
      selection: state.selection.map(changeSet, 1),
      scrollIntoView: true,
      userEvent: nest ? "input.indent" : "delete.dedent",
    });
  }
  // Consumed either way (even a no-op): Tab must not fall through to the
  // browser and move focus out of the editor.
  return true;
}

/** `Tab`: nest a list item / indent a code line. Returns true unconditionally. */
export const tapaIndentMore: Command = (view) => run(view, true);

/** `Shift-Tab`: un-nest a list item / un-indent a code line. Returns true unconditionally. */
export const tapaIndentLess: Command = (view) => run(view, false);

/**
 * Lower precedence than the autocomplete ghost's `Tab` binding, so a visible
 * ghost suggestion still wins; this only runs once the ghost declines.
 */
export const indentKeymap: readonly KeyBinding[] = [
  { key: "Tab", run: tapaIndentMore, shift: tapaIndentLess },
];
