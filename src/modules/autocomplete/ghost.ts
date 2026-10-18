// Ghost text: a muted suggestion drawn right after the caret. Tab inserts it,
// Esc hides it until the next edit. The suggestion comes from `suggest`, fed
// with the other notes plus the live document.
import { syntaxTree } from "@codemirror/language";
import {
  type ChangeSet,
  type EditorState,
  type Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
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
  // The glow rides on the same transaction as the insert. Effects are not
  // recorded by the history, so undo still removes the text in one step.
  view.dispatch({
    changes: { from: ghost.pos, insert: ghost.text },
    selection: { anchor: end },
    effects: addGlow.of({ id: nextGlowId++, from: ghost.pos, to: end }),
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

/** Class on the text Tab just inserted, while it glows. */
export const ACCEPTED_CLASS = "cm-tapa-accepted";

/** How long the accepted text glows before it is plain ink again. */
export const GLOW_MS = 1600;

interface Glow {
  id: number;
  from: number;
  to: number;
}

const addGlow = StateEffect.define<Glow>();
const clearGlow = StateEffect.define<number>();
let nextGlowId = 0;

// Not inclusive: what the person types right after the accepted phrase is
// theirs, so it stays plain. Typing inside the phrase does extend the mark.
const glowMark = (id: number) => Decoration.mark({ class: ACCEPTED_CLASS, id });

/** Whether one change (or a run of adjacent ones) replaces all of `from`–`to`. */
function replacesAll(changes: ChangeSet, from: number, to: number): boolean {
  let all = false;
  changes.iterChangedRanges((fromA, toA) => {
    if (fromA <= from && toA >= to) all = true;
  });
  return all;
}

// Marks are mapped through every change; a mark whose text gets deleted
// becomes empty and RangeSet.map drops it, so edits never leave it dangling.
// Mapping would keep a mark whose whole text was replaced (select the phrase,
// type), glowing on the new text, so such a mark is dropped first. An edit
// that leaves some of the accepted text keeps the glow.
const glowField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks;
    if (tr.docChanged) {
      next = next
        .update({ filter: (from, to) => !replacesAll(tr.changes, from, to) })
        .map(tr.changes);
    }
    for (const e of tr.effects) {
      if (e.is(addGlow)) {
        next = next.update({ add: [glowMark(e.value.id).range(e.value.from, e.value.to)] });
      } else if (e.is(clearGlow)) {
        const id = e.value;
        next = next.update({ filter: (_from, _to, deco) => deco.spec.id !== id });
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// One timer per accepted phrase, so a second accept does not cut the first
// one short or keep it alive. Timers die with the view.
const glowTimers = ViewPlugin.fromClass(
  class {
    readonly timers = new Set<number>();
    constructor(readonly view: EditorView) {}
    update(update: ViewUpdate): void {
      for (const tr of update.transactions) {
        for (const e of tr.effects) if (e.is(addGlow)) this.schedule(e.value.id);
      }
    }
    schedule(id: number): void {
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        this.view.dispatch({ effects: clearGlow.of(id) });
      }, GLOW_MS);
      this.timers.add(timer);
    }
    destroy(): void {
      for (const timer of this.timers) window.clearTimeout(timer);
      this.timers.clear();
    }
  },
);

// The gradient is clipped to the glyphs and the fill fades from transparent
// back to `currentcolor`, i.e. whatever ink the text would have had (body,
// heading, link). That is why the fill colour animates rather than `color`:
// `color: transparent` would make `currentcolor` transparent too and leave no
// ink to fade to. The mark is a single span over one line (suggestions never
// cross a newline), and the default `box-decoration-break: slice` keeps one
// gradient across a soft wrap. Limitations: if Markdown highlighting splits
// the phrase into nested spans the gradient can restart per span, and if the
// span is redrawn mid-glow (an edit inside it) the animation restarts while
// the removal timer does not, so the fade is cut short. The stops walk the
// hue wheel in one direction (pink → orange → gold → green → blue → violet)
// and blend in OKLCH, so no step passes through grey (opposite hues in a
// straight line) or doubles back to an earlier hue. They are dark enough to
// read on the light page.
const ghostTheme = EditorView.baseTheme({
  [`.${GHOST_CLASS}`]: { color: "var(--muted-foreground)", pointerEvents: "none" },
  [`.${ACCEPTED_CLASS}`]: {
    backgroundImage:
      "linear-gradient(90deg in oklch, #e0508c, #e8743a, #d3920f, #3f9e63, #2f7cf2, #9a5cf0)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    animation: `cm-tapa-accepted-fade ${GLOW_MS}ms ease-out forwards`,
  },
  "@keyframes cm-tapa-accepted-fade": {
    "0%": { WebkitTextFillColor: "transparent" },
    "45%": { WebkitTextFillColor: "transparent" },
    "100%": { WebkitTextFillColor: "currentcolor" },
  },
  // No motion: the gradient stays still for the same moment, then the mark
  // is removed and the text is plain again.
  "@media (prefers-reduced-motion: reduce)": {
    [`.${ACCEPTED_CLASS}`]: { animation: "none" },
  },
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
  return [field, keys, glowField, glowTimers, ghostTheme];
}
