import { syntaxTree } from "@codemirror/language";
import type { Extension, Range, Text } from "@codemirror/state";
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
};

const MARK_CLASSES: Record<string, string> = {
  StrongEmphasis: "cm-strong",
  Emphasis: "cm-em",
  InlineCode: "cm-inline-code",
  Link: "cm-link",
};

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }
}

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
    if (!isActive && to > from) decos.push(Decoration.replace({}).range(from, to));
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

  if (name === "Blockquote" || name === "FencedCode") {
    const cls = name === "Blockquote" ? "cm-blockquote" : "cm-code-block";
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    for (let n = startLine; n <= endLine; n++) {
      const lineStart = doc.line(n).from;
      decos.push(Decoration.line({ class: cls }).range(lineStart, lineStart));
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
  const active = activeLines(view);
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
