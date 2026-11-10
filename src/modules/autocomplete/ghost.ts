// Ghost text: a muted suggestion drawn right after the caret. Tab inserts it,
// Esc hides it until the next edit. The suggestion comes from `suggest`, fed
// with the other notes plus the live document. When the notes have nothing
// and an optional `remote` is given (the AI continuation, off by default), a
// pause in typing asks it instead; its answer is shown as the same ghost.
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

/** Extra class on a ghost that came from `remote` rather than the notes. */
export const AI_GHOST_CLASS = "cm-tapa-ghost-ai";

/** How long typing must pause before `remote` is asked. */
export const REMOTE_DELAY_MS = 500;

// Context sent to `remote`, in UTF-16 units; Rust clips again by characters.
const REMOTE_BEFORE = 1500;
const REMOTE_AFTER = 300;

/**
 * Asks for a continuation of the text at the caret. Resolves null when there
 * is none. `signal` aborts when the person types or moves on.
 */
export type RemoteSuggest = (
  before: string,
  after: string,
  signal: AbortSignal,
) => Promise<string | null>;

interface Ghost {
  pos: number;
  text: string;
  ai?: boolean;
}

interface GhostState {
  ghost: Ghost | null;
  dismissed: boolean; // Esc was pressed; stays true until the document changes
}

const dismissGhost = StateEffect.define<null>();
const showRemote = StateEffect.define<Ghost>();

class GhostWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly ai: boolean,
  ) {
    super();
  }
  eq(other: GhostWidget): boolean {
    return other.text === this.text && other.ai === this.ai;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.ai ? `${GHOST_CLASS} ${AI_GHOST_CLASS}` : GHOST_CLASS;
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

/**
 * The text around the caret when `remote` may be asked: one empty selection,
 * outside code, with words before it on the line, at the end of the line or at
 * the end of a word (a non-space before the caret, a space after it).
 */
function remoteContext(state: EditorState): { pos: number; before: string; after: string } | null {
  const sel = state.selection;
  if (sel.ranges.length > 1 || !sel.main.empty) return null;
  const pos = sel.main.head;
  const line = state.doc.lineAt(pos);
  const prefix = state.doc.sliceString(line.from, pos);
  if (!prefix.trim()) return null;
  if (pos < line.to) {
    const endOfWord = /\s/.test(state.doc.sliceString(pos, pos + 1)) && /\S$/.test(prefix);
    if (!endOfWord) return null;
  }
  if (inCode(state, pos)) return null;
  return {
    pos,
    before: state.doc.sliceString(Math.max(0, pos - REMOTE_BEFORE), pos),
    after: state.doc.sliceString(pos, Math.min(state.doc.length, pos + REMOTE_AFTER)),
  };
}

// Asks `remote` once typing pauses, only when the notes offered nothing. Any
// edit or caret move cancels the wait and aborts a request in flight, and an
// answer is shown only if the document and selection are still the ones it
// was asked about.
function remoteAsker(field: StateField<GhostState>, remote: RemoteSuggest) {
  return ViewPlugin.fromClass(
    class {
      timer = -1;
      inflight: AbortController | null = null;
      constructor(readonly view: EditorView) {}
      update(update: ViewUpdate): void {
        if (!update.docChanged && !update.selectionSet) return;
        this.cancel();
        // Typing asks. A click, an accepted ghost or a paste does not.
        if (!update.transactions.some((tr) => tr.isUserEvent("input.type"))) return;
        this.timer = window.setTimeout(() => this.ask(), REMOTE_DELAY_MS);
      }
      ask(): void {
        this.timer = -1;
        const state = this.view.state;
        const current = state.field(field, false);
        if (!current || current.ghost || current.dismissed) return; // local wins
        const ctx = remoteContext(state);
        if (!ctx) return;
        const ctrl = new AbortController();
        this.inflight = ctrl;
        const { doc, selection } = state;
        remote(ctx.before, ctx.after, ctrl.signal).then(
          (text) => {
            if (ctrl.signal.aborted || this.inflight !== ctrl) return;
            this.inflight = null;
            const now = this.view.state;
            if (!text || now.doc !== doc || !now.selection.eq(selection)) return;
            this.view.dispatch({ effects: showRemote.of({ pos: ctx.pos, text, ai: true }) });
          },
          () => {
            if (this.inflight === ctrl) this.inflight = null;
          },
        );
      }
      cancel(): void {
        if (this.timer >= 0) window.clearTimeout(this.timer);
        this.timer = -1;
        this.inflight?.abort();
        this.inflight = null;
      }
      destroy(): void {
        this.cancel();
      }
    },
  );
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
  // An AI ghost reads the same, with a faint dotted underline so the person
  // can tell it was written by the model, not taken from their notes.
  [`.${AI_GHOST_CLASS}`]: {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: "color-mix(in oklch, var(--muted-foreground) 45%, transparent)",
    textUnderlineOffset: "0.2em",
  },
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
 * caret move, so it must be cheap; loading happens elsewhere. `remote` is
 * asked only when the notes offer nothing and typing has paused.
 */
export function ghostText(notes: () => readonly string[], remote?: RemoteSuggest): Extension {
  const field = StateField.define<GhostState>({
    create: (state) => ({ ghost: compute(state, notes()), dismissed: false }),
    update(value, tr) {
      if (tr.effects.some((e) => e.is(dismissGhost))) return { ghost: null, dismissed: true };
      if (!tr.docChanged && !tr.selection) {
        // The asker checked the document and caret are unchanged; a local
        // ghost that appeared meanwhile (notes finished loading) still wins.
        const shown = tr.effects.find((e) => e.is(showRemote));
        if (shown && !value.ghost && !value.dismissed)
          return { ghost: shown.value, dismissed: false };
        return value;
      }
      if (value.dismissed && !tr.docChanged) return { ghost: null, dismissed: true };
      return { ghost: compute(tr.state, notes()), dismissed: false };
    },
    provide: (f) =>
      EditorView.decorations.from(f, ({ ghost }) =>
        ghost
          ? Decoration.set([
              Decoration.widget({
                widget: new GhostWidget(ghost.text, ghost.ai === true),
                side: 1,
              }).range(ghost.pos),
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
  const parts: Extension[] = [field, keys, glowField, glowTimers, ghostTheme];
  if (remote) parts.push(remoteAsker(field, remote));
  return parts;
}
