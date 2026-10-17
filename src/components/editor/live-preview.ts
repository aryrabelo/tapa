import { syntaxTree } from "@codemirror/language";
import { type Extension, type Range, StateEffect, StateField, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

const MARKER_NODES: Record<string, true> = {
  HeaderMark: true,
  EmphasisMark: true,
  CodeMark: true,
  QuoteMark: true,
  ListMark: true,
  LinkMark: true,
  URL: true,
  StrikethroughMark: true,
};

const MARK_CLASSES: Record<string, string> = {
  StrongEmphasis: "cm-strong",
  Emphasis: "cm-em",
  Strikethrough: "cm-strike",
  InlineCode: "cm-inline-code",
  Link: "cm-link",
  // Raw table source (caret inside the table): dim the pipes and `|---|` row.
  TableDelimiter: "cm-table-pipe",
};

/** Block nodes whose every line gets a line class. */
const BLOCK_LINE_CLASSES: Record<string, string> = {
  Blockquote: "cm-blockquote",
  FencedCode: "cm-code-block",
  Table: "cm-table-line",
};

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }
}

/** Set once the person clicks or types. Until then every marker stays hidden. */
export const revealMarkers = StateEffect.define<boolean>();

export const markersRevealed = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(revealMarkers)) return effect.value;
    }
    return value;
  },
});

function markRevealed(view: EditorView): void {
  // `false` as the second argument means "don't throw when the field is absent".
  if (view.state.field(markersRevealed, false) !== false) return;
  view.dispatch({ effects: revealMarkers.of(true) });
}

/** Clicking or typing reveals markers on the active line. Focus alone does not. */
export const revealOnInteract: Extension = EditorView.domEventHandlers({
  keydown: (_event, view) => {
    markRevealed(view);
    return false;
  },
  mousedown: (_event, view) => {
    markRevealed(view);
    return false;
  },
});

/** Line numbers (1-based) touched by any selection range. */
function activeLines(view: EditorView): Set<number> {
  const { doc } = view.state;
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const start = doc.lineAt(range.from).number;
    const end = doc.lineAt(range.to).number;
    for (let n = start; n <= end; n++) lines.add(n);
  }
  return lines;
}

/** Decoration(s) for a single syntax node; pushed into `decos`. */
function decorateNode(
  node: SyntaxNodeRef,
  doc: Text,
  isActive: boolean,
  decos: Range<Decoration>[],
): void {
  const { name, from, to } = node;

  if (MARKER_NODES[name]) {
    if (isActive || to <= from) return;
    // `## Title`: also hide the one space after the heading marker, or the
    // title renders indented by it.
    const spaceAfter =
      name === "HeaderMark" && to < doc.lineAt(from).to && doc.sliceString(to, to + 1) === " ";
    decos.push(Decoration.replace({}).range(from, spaceAfter ? to + 1 : to));
    return;
  }

  const markClass = MARK_CLASSES[name];
  if (markClass) {
    if (to > from) decos.push(Decoration.mark({ class: markClass }).range(from, to));
    return;
  }

  const heading = /^ATXHeading([1-6])$/.exec(name);
  if (heading) {
    const lineStart = doc.lineAt(from).from;
    decos.push(Decoration.line({ class: `cm-h${heading[1]}` }).range(lineStart, lineStart));
    return;
  }

  const lineClass = BLOCK_LINE_CLASSES[name];
  if (lineClass) {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    for (let n = startLine; n <= endLine; n++) {
      const lineStart = doc.line(n).from;
      decos.push(Decoration.line({ class: lineClass }).range(lineStart, lineStart));
    }
    return;
  }

  if (name === "HorizontalRule" && !isActive) {
    decos.push(Decoration.replace({ widget: new HrWidget() }).range(from, to));
  }
}

/** Build the live-preview decoration set. Exported for testability. */
export function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  // Absent field means "already revealed", so tests that only mount `livePreview`
  // still assert on the cursor line. The plugin installs the field at `false`.
  const revealed = view.state.field(markersRevealed, false) !== false;
  const active = revealed ? activeLines(view) : new Set<number>();
  const decos: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        decorateNode(node, doc, active.has(doc.lineAt(node.from).number), decos);
      },
    });
  }

  // Sort: line/inline at the same position order by startSide. RangeSetBuilder
  // is intentionally avoided because line + inline at the same pos is fragile.
  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decos, true);
}

export const livePreview: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(u: ViewUpdate): void {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);
