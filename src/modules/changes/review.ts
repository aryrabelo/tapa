// Review mode: the open note shown against its previous version, in the text
// itself. Added text is tinted, removed text sits inline and struck through, and
// each change has Keep and Undo. Loaded on first use, since it carries
// @codemirror/merge.
//
// Everything lives in the editor's own state, behind a compartment appended to
// that one view. Each note gets a new view (App keys the editor by note), so a
// base can never outlive its note or reach another one.
import {
  getChunks,
  getOriginalDoc,
  originalDocChangeEffect,
  unifiedMergeView,
} from "@codemirror/merge";
import {
  ChangeSet,
  type ChangeSpec,
  Compartment,
  type EditorState,
  type Extension,
  StateEffect,
} from "@codemirror/state";
import { EditorView, ViewPlugin, type PluginValue } from "@codemirror/view";
import { tableAsSource } from "@/components/editor/table-widget";
import { getEditorView } from "@/lib/editor-view";
import { registry } from "@/lib/registry";
import { type PreviousVersion, previousVersion } from "@/lib/tauri";
import { useStore } from "@/state/store";
import { SOURCE_LABEL } from "./labels";

const review = new Compartment();

export function isReviewing(state: EditorState): boolean {
  return getChunks(state) !== null;
}

/** Changes still waiting for Keep or Undo. 0 outside review. */
export function remainingChanges(state: EditorState): number {
  return getChunks(state)?.chunks.length ?? 0;
}

/**
 * Show the note against `base`. Returns false, and changes nothing, when the
 * note already matches it.
 */
export function startReview(view: EditorView, base: PreviousVersion): boolean {
  if (base.text.replace(/\r\n/g, "\n") === view.state.doc.toString()) return false;
  const ext: Extension = [
    unifiedMergeView({
      original: base.text,
      mergeControls: chunkButton,
      // A changed word in a paragraph shows inline, not as the whole paragraph twice.
      allowInlineDiffs: true,
      gutter: false,
    }),
    ViewPlugin.define((v) => reviewBar(v, base.source)),
    reviewTheme,
    // A drawn table would cover the highlights and removed text of a change in it.
    tableAsSource.of(
      (state, from, to) =>
        getChunks(state)?.chunks.some((c) => c.fromB <= to && c.endB >= from) ?? false,
    ),
  ];
  view.dispatch({
    effects:
      review.get(view.state) === undefined
        ? StateEffect.appendConfig.of(review.of(ext))
        : review.reconfigure(ext),
  });
  return true;
}

export function stopReview(view: EditorView): void {
  if (!isReviewing(view.state)) return;
  view.dispatch({ effects: review.reconfigure([]) });
}

/** The current text becomes the base. Only the in-memory base moves: never the disk or Git. */
export function keepAll(view: EditorView): void {
  const { state } = view;
  if (remainingChanges(state) === 0) return;
  const base = getOriginalDoc(state);
  const changes = ChangeSet.of({ from: 0, to: base.length, insert: state.doc }, base.length);
  view.dispatch({ effects: originalDocChangeEffect(state, changes), userEvent: "accept" });
}

/**
 * Put back the base text of every change, in one undo step. Each chunk is
 * reverted the way @codemirror/merge's own rejectChunk reverts one.
 */
export function undoAll(view: EditorView): void {
  const { state } = view;
  const chunks = getChunks(state)?.chunks;
  if (!chunks?.length) return;
  const base = getOriginalDoc(state);
  const end = state.doc.length;
  const changes: ChangeSpec[] = chunks.map((ch) => {
    let insert = base.sliceString(ch.fromA, Math.max(ch.fromA, ch.toA - 1));
    if (ch.fromA !== ch.toA && ch.toB <= end) insert += state.lineBreak;
    return { from: ch.fromB, to: Math.min(end, ch.toB), insert };
  });
  view.dispatch({ changes, userEvent: "revert" });
}

export type ReviewOutcome = "started" | "nothing" | "stale";

/**
 * The `changes.review` command: read the open note's previous version and
 * review against it. Already reviewing counts as started: Done and Escape
 * are the way out. "nothing" means there is no earlier version, it could not
 * be read, or the note matches it. "stale" means there is no open editor, or
 * the note changed while the earlier version was being read.
 */
export async function reviewOpenNote(): Promise<ReviewOutcome> {
  const view = getEditorView();
  const { root, activePath } = useStore.getState();
  if (!view || !root || !activePath) return "stale";
  if (isReviewing(view.state)) return "started";
  let base: PreviousVersion | null;
  try {
    base = await previousVersion(`${root}/${activePath}`);
  } catch {
    base = null;
  }
  // Another note (or none) is open now: its editor is a different view.
  if (getEditorView() !== view) return "stale";
  if (!base) return "nothing";
  return startReview(view, base) ? "started" : "nothing";
}

/** Keep and Undo under each change. Mousedown is swallowed so the note keeps the keyboard. */
function chunkButton(type: "accept" | "reject", action: (e: MouseEvent) => void): HTMLElement {
  const keep = type === "accept";
  return button(
    keep ? "Keep" : "Undo",
    keep ? "Keep this change" : "Undo this change",
    action,
    keep ? "accept" : "reject",
  );
}

function button(
  text: string,
  label: string,
  onClick: (e: MouseEvent) => void,
  name?: string,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (label !== text) b.setAttribute("aria-label", label);
  if (name) b.name = name;
  b.onmousedown = (e) => e.preventDefault();
  b.onclick = onClick;
  return b;
}

/** Something else has the keyboard's Escape: a panel, the file finder, the rename box. */
function overlayOpen(): boolean {
  const { paletteOpen, renameOpen } = useStore.getState();
  return registry.activePanel() !== null || paletteOpen || renameOpen;
}

/**
 * The slim bar above the note: where the base came from, what is left, and the
 * bulk actions. It sits in the editor's own frame, above the scroller, so it
 * leaves with the view. (A plain plugin rather than CodeMirror's panels: those
 * would add code to the chunk every note loads.)
 */
function reviewBar(view: EditorView, source: PreviousVersion["source"]): PluginValue {
  const dom = document.createElement("div");
  dom.className = "cm-tapa-review";
  dom.setAttribute("role", "toolbar");
  dom.setAttribute("aria-label", "Review changes");
  const row = dom.appendChild(document.createElement("div"));
  row.className = "cm-tapa-review-row";

  const title = row.appendChild(document.createElement("span"));
  title.className = "cm-tapa-review-source";
  title.textContent = SOURCE_LABEL[source];
  const count = row.appendChild(document.createElement("span"));
  count.className = "cm-tapa-review-count";
  count.setAttribute("aria-live", "polite");

  const done = () => {
    stopReview(view);
    view.focus();
  };
  const actions = row.appendChild(document.createElement("span"));
  actions.className = "cm-tapa-review-actions";
  actions.append(
    button("Keep all", "Keep all", () => keepAll(view)),
    button("Undo all", "Undo all", () => undoAll(view)),
    button("Done", "Done", done),
  );

  let alive = true;
  const show = (state: EditorState) => {
    const n = remainingChanges(state);
    count.textContent = n === 1 ? "1 change left" : `${n} changes left`;
    // Nothing left to review: leave on our own. Not from inside this update.
    if (n === 0) {
      queueMicrotask(() => {
        if (alive) stopReview(view);
      });
    }
  };
  show(view.state);

  // A handled Escape (a selection collapsing, a suggestion hiding) stays with the note.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented || overlayOpen()) return;
    e.preventDefault();
    done();
  };
  window.addEventListener("keydown", onKey);
  view.dom.insertBefore(dom, view.scrollDOM);

  return {
    update(u) {
      if (getChunks(u.state)?.chunks !== getChunks(u.startState)?.chunks) show(u.state);
    },
    destroy() {
      alive = false;
      window.removeEventListener("keydown", onKey);
      dom.remove();
    },
  };
}

// Calm tints in the app's palette; translucent, so they read on light and dark.
const ADDED = "oklch(0.72 0.13 150)";
const REMOVED = "oklch(0.66 0.15 25)";
const tint = (color: string, pct: number) => `color-mix(in oklch, ${color} ${pct}%, transparent)`;

const reviewTheme = EditorView.theme({
  ".cm-tapa-review": {
    flexShrink: "0",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    borderBottom: "1px solid var(--border)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.8125rem",
  },
  // Lined up with the text column below it.
  ".cm-tapa-review-row": {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    boxSizing: "border-box",
    maxWidth: "calc(680px * var(--text-zoom, 1) + 4rem)",
    margin: "0 auto",
    padding: "0.375rem 2rem",
  },
  ".cm-tapa-review-source": { fontWeight: "500" },
  ".cm-tapa-review-count": { color: "var(--muted-foreground)" },
  ".cm-tapa-review-actions": { display: "flex", gap: "0.375rem", marginInlineStart: "auto" },
  ".cm-tapa-review button, .cm-deletedChunk .cm-chunkButtons button": {
    font: "inherit",
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    lineHeight: "1.5",
    color: "var(--foreground)",
    background: "var(--background)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    padding: "0.0625rem 0.5rem",
    margin: "0",
    cursor: "pointer",
  },
  ".cm-tapa-review button:hover, .cm-deletedChunk .cm-chunkButtons button:hover": {
    background: "var(--muted)",
  },
  ".cm-tapa-review button:focus-visible, .cm-deletedChunk .cm-chunkButtons button:focus-visible": {
    outline: "2px solid var(--ring)",
    outlineOffset: "1px",
  },

  // Changed lines and the text that came in.
  "&.cm-merge-b .cm-changedLine, & .cm-inlineChangedLine": {
    backgroundColor: tint(ADDED, 7),
  },
  "&.cm-merge-b .cm-changedText": {
    background: tint(ADDED, 26),
    borderRadius: "2px",
  },

  // What went out: above the line (whole lines) or inline (a few words), struck through.
  "& .cm-deletedChunk": {
    backgroundColor: "transparent",
    paddingLeft: "0",
    color: "var(--muted-foreground)",
  },
  "& .cm-deletedChunk .cm-chunkButtons": {
    position: "static",
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.375rem",
    padding: "0.25rem 0 0.125rem",
  },
  // Same inset as CodeMirror's own lines, so removed text lines up with the rest.
  "& .cm-deletedChunk .cm-deletedLine": {
    backgroundColor: tint(REMOVED, 7),
    padding: "0 2px 0 6px",
  },
  "& .cm-deletedChunk .cm-deletedText, &.cm-merge-b .cm-deletedText": {
    background: tint(REMOVED, 16),
    textDecoration: "line-through",
    textDecorationColor: tint(REMOVED, 80),
    color: "var(--muted-foreground)",
    borderRadius: "2px",
  },
});
