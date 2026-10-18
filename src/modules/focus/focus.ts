// Focus mode: the sentence under the caret stays at full contrast and the rest
// of the note fades. Typewriter scrolling keeps the caret's line in the middle
// of the editor while you type or move with the keyboard.
import { EditorState, type Extension, Transaction } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/** Class on every dimmed range. Also the marker the bundle check greps for. */
export const DIM_CLASS = "cm-tapa-dim";

const HEADING = /^\s{0,3}#{1,6}(\s|$)/;
// A terminator run, any closing quote/bracket/emphasis after it, then the
// whitespace that ends the sentence. "e.g. this" splits too: a known miss.
const BOUNDARY = /[.!?…]+["'”’)\]*_]*\s+/g;

const isBlank = (text: string) => text.trim() === "";
// A heading or a list item opens a block of its own.
const BLOCK_START = /^\s{0,3}#{1,6}(\s|$)|^\s*([-*+]|\d+[.)])\s/;

/**
 * Range of the sentence containing `pos`, trailing whitespace included, or
 * null on a blank line. Sentences never cross a paragraph break; a heading is
 * one block on its own and each list item starts a new block. Code blocks are
 * not special-cased, so a fenced block reads as one paragraph.
 */
export function sentenceAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  if (isBlank(line.text)) return null;
  let first = line.number;
  let last = line.number;
  if (!HEADING.test(line.text)) {
    while (first > 1 && !BLOCK_START.test(doc.line(first).text)) {
      const prev = doc.line(first - 1).text;
      if (isBlank(prev) || HEADING.test(prev)) break;
      first--;
    }
    while (last < doc.lines) {
      const next = doc.line(last + 1).text;
      if (isBlank(next) || BLOCK_START.test(next)) break;
      last++;
    }
  }
  const from = doc.line(first).from;
  const to = doc.line(last).to;
  const text = doc.sliceString(from, to);
  const offset = pos - from;
  let start = 0;
  for (const m of text.matchAll(BOUNDARY)) {
    const next = m.index + m[0].length;
    // A caret right after the whitespace belongs to the next sentence.
    if (offset < next) return { from: from + start, to: from + next };
    start = next;
  }
  return { from: from + start, to };
}

const dimMark = Decoration.mark({ class: DIM_CLASS });

// Only the visible ranges are decorated, so a long note costs what fits on screen.
function dimRanges(view: EditorView): DecorationSet {
  // With a selection, the sentence at its head (where the caret blinks) stays lit.
  const lit = sentenceAt(view.state, view.state.selection.main.head);
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    const beforeEnd = lit ? Math.min(to, lit.from) : to;
    if (from < beforeEnd) ranges.push(dimMark.range(from, beforeEnd));
    if (!lit) continue;
    const afterStart = Math.max(from, lit.to);
    if (afterStart < to) ranges.push(dimMark.range(afterStart, to));
  }
  return Decoration.set(ranges);
}

const dimTheme = EditorView.baseTheme({
  [`.${DIM_CLASS}`]: { opacity: "0.35", transition: "opacity 120ms ease-out" },
});

// The browser's own caret is 1px, blinks off half the time, and in a faded
// page is easy to lose. Focus draws its own: no blink, 3px, in the accent the
// app already uses for focus rings and the selection. It sits in CodeMirror's
// cursor layer, outside the text, so no dim mark can reach it. `theme` (not
// `baseTheme`) so it outranks the live-preview caret rule; when Focus is off
// the extension and this class leave the editor and the normal caret returns.
const focusCaret = [
  drawSelection({ cursorBlinkRate: 0 }),
  EditorView.theme({
    "&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor": {
      borderLeftWidth: "3px",
      borderLeftStyle: "solid",
      borderLeftColor: "var(--ring)",
      marginLeft: "-1.5px",
    },
  }),
];

/** Dims every visible character outside the caret's sentence. */
export function dimOtherSentences(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = dimRanges(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) {
          this.decorations = dimRanges(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [plugin, dimTheme, focusCaret];
}

// Rides on the user's own transaction instead of dispatching a new one, so
// it cannot loop, and a wheel scroll (no transaction) never fights it.
// Clicks are left alone: recentring under the mouse would move the text the
// user is pointing at mid-drag. The next keystroke recentres. Changes made by
// code (a disk reload, jump-to-line) carry no user event and keep their own scroll.
const centreOnUserMove = EditorState.transactionExtender.of((tr) => {
  if (!tr.docChanged && !tr.selection) return null;
  if (tr.annotation(Transaction.userEvent) === undefined || tr.isUserEvent("select.pointer")) {
    return null;
  }
  return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) };
});

// Centres once when the extension arrives: a note opening with Focus on, or
// the switch turning on. Deferred to a microtask because a plugin is built
// inside an update, where dispatching is not allowed. Only once, so later
// wheel scrolling is left alone.
const centreOnArrival = ViewPlugin.define((view) => {
  let live = true;
  queueMicrotask(() => {
    if (!live) return;
    const head = view.state.selection.main.head;
    view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) });
  });
  return {
    destroy() {
      live = false;
    },
  };
});

/** Keeps the caret line vertically centred while typing or moving with keys. */
export function keepLineCentred(): Extension {
  return [
    centreOnUserMove,
    centreOnArrival,
    // Half a screen of room above the first line and below the last, so
    // either can reach the middle. 50vh assumes the editor fills the window.
    EditorView.contentAttributes.of({ style: "padding-top: 50vh; padding-bottom: 50vh" }),
  ];
}
