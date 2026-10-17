import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, type WidgetType } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { livePreview } from "./live-preview";
import { buildTableDecorations, tableWidgets } from "./table-widget";

interface Hit {
  from: number;
  to: number;
  block: boolean;
  widget: WidgetType | undefined;
}

function decorations(state: EditorState): Hit[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  if (!tree) throw new Error("parse did not finish");
  const hits: Hit[] = [];
  buildTableDecorations(state, tree).between(0, state.doc.length, (from, to, deco) => {
    hits.push({ from, to, block: deco.spec.block === true, widget: deco.spec.widget });
  });
  return hits;
}

function mkState(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), livePreview, tableWidgets],
  });
}

const created: EditorView[] = [];
function mount(doc: string, anchor: number): EditorView {
  const v = new EditorView({ state: mkState(doc, anchor), parent: document.body });
  created.push(v);
  return v;
}

/** Render the single table widget of `doc` (caret on the first line, outside it). */
function renderTable(doc: string): HTMLElement {
  const v = mount(doc, 0);
  const [hit] = decorations(v.state);
  if (!hit?.widget) throw new Error("no table widget");
  return hit.widget.toDOM(v);
}

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
});

const TABLE = "| Name | Qty |\n|---|---|\n| apple | 3 |\n";
const DOC = `Intro\n\n${TABLE}\nOutro\n`;
const TABLE_FROM = DOC.indexOf("| Name");
const TABLE_TO = TABLE_FROM + TABLE.length - 1; // end of the last row line

describe("tableWidgets decorations", () => {
  it("replaces the whole table with one block widget while the caret is outside", () => {
    const hits = decorations(mkState(DOC, 0));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ from: TABLE_FROM, to: TABLE_TO, block: true });
    expect(hits[0]?.widget).toBeDefined();
  });

  it("shows the raw table while the caret is inside it, including both edges", () => {
    expect(decorations(mkState(DOC, DOC.indexOf("apple")))).toHaveLength(0);
    expect(decorations(mkState(DOC, TABLE_FROM))).toHaveLength(0);
    expect(decorations(mkState(DOC, TABLE_TO))).toHaveLength(0);
  });

  it("renders the widget in a mounted view and reveals the source when the caret enters", () => {
    const v = mount(DOC, 0);
    expect(v.dom.querySelectorAll("table.tapa-table")).toHaveLength(1);
    v.dispatch({ selection: { anchor: DOC.indexOf("apple") } });
    expect(v.dom.querySelector("table.tapa-table")).toBeNull();
    expect(v.dom.querySelectorAll(".cm-line.cm-table-line")).toHaveLength(3);
  });
});

describe("TableWidget DOM", () => {
  it("builds wrap > table > thead/tbody with header and body cell text", () => {
    const wrap = renderTable(DOC);
    expect(wrap.matches("div.tapa-table-wrap")).toBe(true);
    const table = wrap.querySelector(":scope > table.tapa-table");
    expect(table).not.toBeNull();
    const header = [...wrap.querySelectorAll("thead > tr > th")].map((c) => c.textContent);
    const body = [...wrap.querySelectorAll("tbody > tr > td")].map((c) => c.textContent);
    expect(header).toEqual(["Name", "Qty"]);
    expect(body).toEqual(["apple", "3"]);
  });

  it("renders inline markdown inside cells without markers or hrefs", () => {
    const doc = "x\n\n| a |\n|---|\n| **b** `c` [d](https://e.com) ~~f~~ g\\|h |\n";
    const td = renderTable(doc).querySelector("tbody td");
    expect(td?.querySelector("strong")?.textContent).toBe("b");
    expect(td?.querySelector("code")?.textContent).toBe("c");
    expect(td?.querySelector(".cm-link")?.textContent).toBe("d");
    expect(td?.querySelector("del")?.textContent).toBe("f");
    expect(td?.querySelector("a")).toBeNull();
    expect(td?.textContent).toBe("b c d f g|h");
  });

  it("applies column alignment from the delimiter row", () => {
    const doc = "x\n\n| l | c | r |\n|:---|:---:|---:|\n| 1 | 2 | 3 |\n";
    const wrap = renderTable(doc);
    const header = [...wrap.querySelectorAll("th")].map((c) => (c as HTMLElement).style.textAlign);
    const body = [...wrap.querySelectorAll("td")].map((c) => (c as HTMLElement).style.textAlign);
    expect(header).toEqual(["left", "center", "right"]);
    expect(body).toEqual(["left", "center", "right"]);

    const plain = renderTable("x\n\n| a |\n|---|\n| 1 |\n").querySelector("td") as HTMLElement;
    expect(plain.style.textAlign).toBe("");
  });

  it("pads short rows, drops extra cells and keeps empty middle cells", () => {
    const doc = "x\n\n| a | b | c |\n|---|---|---|\n| 1 |\n| 1 | | 3 |\n| 1 | 2 | 3 | 4 |\n";
    const rows = [...renderTable(doc).querySelectorAll("tbody > tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent),
    );
    expect(rows).toEqual([
      ["1", "", ""],
      ["1", "", "3"],
      ["1", "2", "3"],
    ]);
  });

  it("points data-from at each cell's content offset", () => {
    const wrap = renderTable(DOC);
    const offsets = [...wrap.querySelectorAll<HTMLElement>("[data-from]")].map((c) =>
      Number(c.dataset.from),
    );
    expect(offsets).toEqual([
      DOC.indexOf("Name"),
      DOC.indexOf("Qty"),
      DOC.indexOf("apple"),
      DOC.indexOf("3 |"),
    ]);
  });
});

describe("TableWidget click-to-edit", () => {
  it("moves the caret into the clicked cell and reveals the raw table", () => {
    const v = mount(DOC, 0);
    const cell = [...v.dom.querySelectorAll<HTMLElement>("td")].find(
      (td) => td.textContent === "3",
    );
    if (!cell) throw new Error("cell not rendered");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    cell.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(v.state.selection.main.head).toBe(DOC.indexOf("3 |"));
    expect(v.dom.querySelector("table.tapa-table")).toBeNull();
  });

  it("puts the caret at the table start when clicking outside any cell", () => {
    const v = mount(DOC, 0);
    const wrap = v.dom.querySelector<HTMLElement>(".tapa-table-wrap");
    if (!wrap) throw new Error("table not rendered");
    wrap.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    expect(v.state.selection.main.head).toBe(TABLE_FROM);
  });
});
