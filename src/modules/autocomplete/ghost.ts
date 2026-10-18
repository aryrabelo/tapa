// Ghost text: a muted suggestion drawn right after the caret. Tab inserts it,
// Esc hides it until the next edit. The suggestion comes from `suggest`, fed
// with the other notes plus the live document.
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";
import { suggest } from "./provider";

/** Class on the ghost span. Also the marker the bundle check greps for. */
export const GHOST_CLASS = "cm-tapa-ghost";

interface Ghost {
  pos: number;
  text: string;
}

interface GhostState {
  ghost: Ghost | null;
  dismissed: boolean; // Esc was pressed; stays true until the document changes
}

const dismissGhost = StateEffect.define<null>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = GHOST_CLASS;
    span.setAttribute("aria-hidden", "true");
    span.textContent = this.text;
    return span;
  }
}

const CODE_NODES = new Set(["FencedCode", "CodeBlock"]);

// Relies on the markdown language already in the editor. Without it there is
// no tree and this check passes. A region the parser has not reached yet (far
// outside the viewport) also passes, which the caret rarely is in.
function inCode(state: EditorState, pos: number): boolean {
  const inner = syntaxTree(state).resolveInner(pos, -1);
  for (let node: typeof inner | null = inner; node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }
  return false;
}

function compute(state: EditorState, notes: readonly string[]): Ghost | null {
  const sel = state.selection;
  if (sel.ranges.length > 1 || !sel.main.empty) return null;
  const pos = sel.main.head;
  const line = state.doc.lineAt(pos);
  // Only at the end of a word: end of line or whitespace next.
  if (pos < line.to && !/\s/.test(state.doc.sliceString(pos, pos + 1))) return null;
  const before = state.doc.sliceString(line.from, pos);
  if (!before || inCode(state, pos)) return null;
  // The live document minus the caret's own line, so what is being typed
  // does not suggest itself. Earlier text on the same line is not used.
  const live = state.doc.sliceString(0, line.from) + state.doc.sliceString(line.to);
  const text = suggest([...notes, live], before);
  return text ? { pos, text } : null;
}

function accept(view: EditorView, field: StateField<GhostState>): boolean {
  const ghost = view.state.field(field, false)?.ghost;
  if (!ghost) return false; // no ghost: Tab keeps its normal behaviour
  const end = ghost.pos + ghost.text.length;
  view.dispatch({
    changes: { from: ghost.pos, insert: ghost.text },
    selection: { anchor: end },
    userEvent: "input.complete",
    scrollIntoView: true,
  });
  return true;
}

function dismiss(view: EditorView, field: StateField<GhostState>): boolean {
  if (!view.state.field(field, false)?.ghost) return false;
  view.dispatch({ effects: dismissGhost.of(null) });
  return true;
}

const ghostTheme = EditorView.baseTheme({
  [`.${GHOST_CLASS}`]: { color: "var(--muted-foreground)", pointerEvents: "none" },
});

/**
 * `notes` returns the text of the other notes. It is read on every edit or
 * caret move, so it must be cheap; loading happens elsewhere.
 */
export function ghostText(notes: () => readonly string[]): Extension {
  const field = StateField.define<GhostState>({
    create: (state) => ({ ghost: compute(state, notes()), dismissed: false }),
    update(value, tr) {
      if (tr.effects.some((e) => e.is(dismissGhost))) return { ghost: null, dismissed: true };
      if (!tr.docChanged && !tr.selection) return value;
      if (value.dismissed && !tr.docChanged) return { ghost: null, dismissed: true };
      return { ghost: compute(tr.state, notes()), dismissed: false };
    },
    provide: (f) =>
      EditorView.decorations.from(f, ({ ghost }) =>
        ghost
          ? Decoration.set([
              Decoration.widget({ widget: new GhostWidget(ghost.text), side: 1 }).range(ghost.pos),
            ])
          : Decoration.none,
      ),
  });
  const keys = Prec.highest(
    keymap.of([
      { key: "Tab", run: (view) => accept(view, field) },
      { key: "Escape", run: (view) => dismiss(view, field) },
    ]),
  );
  return [field, keys, ghostTheme];
}
