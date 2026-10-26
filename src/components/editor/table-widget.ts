import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  type Extension,
  Facet,
  type Range,
  StateField,
  type Text,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";

/** Containers a GFM table can live inside; the tree walk descends only into these. */
const CONTAINERS: Record<string, true> = {
  Document: true,
  Blockquote: true,
  BulletList: true,
  OrderedList: true,
  ListItem: true,
};

/** Inline wrappers rendered as an element around their (marker-free) children. */
const INLINE_TAGS: Record<string, string> = {
  StrongEmphasis: "strong",
  Emphasis: "em",
  InlineCode: "code",
  Strikethrough: "del",
};

/** Syntax-only inline nodes that never produce visible text. */
const HIDDEN_INLINE: Record<string, true> = {
  EmphasisMark: true,
  CodeMark: true,
  LinkMark: true,
  StrikethroughMark: true,
  URL: true,
  LinkTitle: true,
  LinkLabel: true,
};

type Align = "left" | "center" | "right" | null;

interface Cell {
  /** Absolute doc offset where the cell's content starts. */
  from: number;
  /** The `TableCell` node, or null for an empty / padded cell. */
  node: SyntaxNode | null;
}

/** Split a TableHeader / TableRow into its cells, keeping empty `| |` cells. */
function rowCells(row: SyntaxNode, doc: Text): Cell[] {
  const cells: Cell[] = [];
  let sawDelimiter = false;
  let cellInSegment = false;
  let segmentFrom = row.from;
  for (let c = row.firstChild; c; c = c.nextSibling) {
    if (c.name === "TableDelimiter") {
      // Two pipes with no TableCell between them = an empty cell. A leading
      // pipe (nothing before it) does not open a cell.
      if (sawDelimiter && !cellInSegment) {
        const from =
          doc.sliceString(segmentFrom, segmentFrom + 1) === " " ? segmentFrom + 1 : segmentFrom;
        cells.push({ from, node: null });
      }
      sawDelimiter = true;
      cellInSegment = false;
      segmentFrom = c.to;
    } else if (c.name === "TableCell") {
      cells.push({ from: c.from, node: c });
      cellInSegment = true;
    }
  }
  return cells;
}

/** Column alignments from the `|:---|:---:|---:|` delimiter row. */
function parseAlignments(delimiterRow: string): Align[] {
  let text = delimiterRow.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((part) => {
    const spec = part.trim();
    const left = spec.startsWith(":");
    const right = spec.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

/** Render `node`'s children within [from, to) into `parent`; gaps become text. */
function renderChildren(
  node: SyntaxNode,
  from: number,
  to: number,
  doc: Text,
  parent: HTMLElement,
): void {
  let pos = from;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.to <= from) continue;
    if (c.from >= to) break;
    if (c.from > pos) parent.appendChild(document.createTextNode(doc.sliceString(pos, c.from)));
    renderInline(c, doc, parent);
    pos = c.to;
  }
  if (pos < to) parent.appendChild(document.createTextNode(doc.sliceString(pos, to)));
}

/** Visible text range of a Link/Image: between `[` (or `![`) and the first `]`. */
function linkTextRange(node: SyntaxNode): [number, number] {
  let open = node.from;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name !== "LinkMark") continue;
    if (open === node.from && c.from === node.from) {
      open = c.to;
      continue;
    }
    return [open, c.from];
  }
  return [open, node.to];
}

function renderInline(node: SyntaxNode, doc: Text, parent: HTMLElement): void {
  const { name } = node;
  if (HIDDEN_INLINE[name]) return;

  const tag = INLINE_TAGS[name];
  if (tag) {
    const el = document.createElement(tag);
    renderChildren(node, node.from, node.to, doc, el);
    parent.appendChild(el);
    return;
  }

  if (name === "Link" || name === "Image") {
    // Never an <a href>: a click would navigate the Tauri webview.
    const span = document.createElement("span");
    if (name === "Link") span.className = "cm-link";
    const [from, to] = linkTextRange(node);
    renderChildren(node, from, to, doc, span);
    parent.appendChild(span);
    return;
  }

  if (name === "Escape") {
    parent.appendChild(document.createTextNode(doc.sliceString(node.from + 1, node.to)));
    return;
  }

  parent.appendChild(document.createTextNode(doc.sliceString(node.from, node.to)));
}

class TableWidget extends WidgetType {
  constructor(
    /** Source text of the table node. */
    readonly source: string,
    /** Doc offset of the table node. */
    readonly from: number,
    readonly node: SyntaxNode,
    readonly doc: Text,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from;
  }

  get estimatedHeight(): number {
    // Every source line but the delimiter row becomes a ~2.25rem table row.
    return this.source.split("\n").length * 36;
  }

  toDOM(view: EditorView): HTMLElement {
    const { node, doc } = this;
    const wrap = document.createElement("div");
    wrap.className = "tapa-table-wrap";
    const table = document.createElement("table");
    table.className = "tapa-table";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    wrap.appendChild(table);

    let columns = 0;
    let aligns: Align[] = [];
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === "TableHeader") {
        const cells = rowCells(c, doc);
        columns = cells.length;
        thead.appendChild(this.renderRow(cells, columns, aligns, "th", c.to));
      } else if (c.name === "TableDelimiter") {
        aligns = parseAlignments(doc.sliceString(c.from, c.to));
        // The header row was rendered before alignments were known.
        thead.querySelectorAll("th").forEach((th, i) => {
          const align = aligns[i];
          if (align) th.style.textAlign = align;
        });
      } else if (c.name === "TableRow") {
        tbody.appendChild(this.renderRow(rowCells(c, doc), columns, aligns, "td", c.to));
      }
    }

    wrap.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const cell = target?.closest<HTMLElement>("[data-from]");
      const anchor = cell ? Number(cell.dataset.from) : this.from;
      event.preventDefault();
      view.dispatch({ selection: { anchor } });
      view.focus();
    });
    return wrap;
  }

  private renderRow(
    cells: Cell[],
    columns: number,
    aligns: Align[],
    tag: "th" | "td",
    rowEnd: number,
  ): HTMLTableRowElement {
    const tr = document.createElement("tr");
    for (let i = 0; i < columns; i++) {
      const cell = cells[i];
      const el = document.createElement(tag);
      el.dataset.from = String(cell ? cell.from : rowEnd);
      const align = aligns[i];
      if (align) el.style.textAlign = align;
      if (cell?.node) renderChildren(cell.node, cell.node.from, cell.node.to, this.doc, el);
      tr.appendChild(el);
    }
    return tr;
  }

  ignoreEvent(event: Event): boolean {
    // The widget owns its mouse handling (click-to-edit); CodeMirror must not
    // also position the caret from it.
    return event instanceof MouseEvent;
  }
}

/**
 * Tables another extension needs as Markdown source, each provider answering
 * for one table's [from, to]. Review mode uses it: a drawn table is a block
 * replace, which would hide the highlights and removed text of a change in it.
 */
export const tableAsSource =
  Facet.define<(state: EditorState, from: number, to: number) => boolean>();

/**
 * Block-replace every GFM table the selection does not touch with a rendered
 * table widget. Exported for testability; `tree` defaults to the state's
 * current (possibly partial) syntax tree.
 */
export function buildTableDecorations(
  state: EditorState,
  tree: Tree = syntaxTree(state),
): DecorationSet {
  const { doc, selection } = state;
  const asSource = state.facet(tableAsSource);
  const decos: Range<Decoration>[] = [];
  tree.iterate({
    enter(ref) {
      if (CONTAINERS[ref.name]) return undefined;
      if (ref.name === "Table") {
        const { from, to } = ref;
        // Inclusive: a caret at either table edge counts as inside.
        const touched = selection.ranges.some((r) => r.from <= to && r.to >= from);
        if (!touched && !asSource.some((wants) => wants(state, from, to))) {
          const widget = new TableWidget(doc.sliceString(from, to), from, ref.node, doc);
          decos.push(
            Decoration.replace({ widget, block: true }).range(
              doc.lineAt(from).from,
              doc.lineAt(to).to,
            ),
          );
        }
      }
      return false;
    },
  });
  return Decoration.set(decos);
}

/**
 * Renders GFM tables as real tables while the caret is elsewhere; clicking a
 * cell reveals that table's raw source with the caret in the clicked cell.
 * A StateField because block decorations cannot come from a ViewPlugin.
 * Effects and reconfiguration rebuild too: a `tableAsSource` provider may
 * answer differently after either.
 */
export const tableWidgets: Extension = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update(decos, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.effects.length > 0 ||
      tr.reconfigured ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    ) {
      return buildTableDecorations(tr.state);
    }
    return decos;
  },
  provide: (field) => EditorView.decorations.from(field),
});
