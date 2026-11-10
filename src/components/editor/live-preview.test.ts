import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { buildDecorations, livePreview, markersRevealed } from "./live-preview";

interface DecoHit {
  from: number;
  to: number;
  spec: { class?: string };
  isReplace: boolean;
}

function mkView(doc: string, anchor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage }), livePreview],
  });
  return new EditorView({ state, parent: document.body });
}

function collect(view: EditorView): DecoHit[] {
  const set = buildDecorations(view);
  const hits: DecoHit[] = [];
  set.between(0, view.state.doc.length, (from, to, deco: Decoration) => {
    const spec = deco.spec as { class?: string; widget?: unknown };
    hits.push({ from, to, spec, isReplace: from !== to && !spec.class });
  });
  return hits;
}

const created: EditorView[] = [];
function view(doc: string, anchor: number): EditorView {
  const v = mkView(doc, anchor);
  created.push(v);
  return v;
}

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
});

describe("livePreview buildDecorations", () => {
  it("hides markers on the cursor line until the person interacts", () => {
    const doc = "# Title\n";
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), markersRevealed, livePreview],
    });
    const v = new EditorView({ state, parent: document.body });
    created.push(v);
    const hidden = collect(v).find((h) => h.isReplace && h.from === 0);
    expect(hidden?.to).toBe("# ".length);
  });

  it("styles the heading line and hides bold markers on an inactive line", () => {
    const doc = "# Title\n**bold** text\n";
    const v = view(doc, 0); // cursor on line 1
    const hits = collect(v);

    // cm-h1 line decoration at line-1 start (offset 0), zero-width.
    const h1 = hits.find((h) => h.spec.class === "cm-h1");
    expect(h1).toBeDefined();
    expect(h1?.from).toBe(0);
    expect(h1?.to).toBe(0);

    // The "**" markers around `bold` live on line 2 (inactive) -> hidden via replace.
    const boldStart = doc.indexOf("**");
    const hiddenOpen = hits.find(
      (h) => h.isReplace && h.from === boldStart && h.to === boldStart + 2,
    );
    expect(hiddenOpen).toBeDefined();

    // The word `bold` gets a cm-strong mark regardless of active state.
    const wordFrom = doc.indexOf("bold");
    const strong = hits.find(
      (h) => h.spec.class === "cm-strong" && h.from <= wordFrom && h.to >= wordFrom + 4,
    );
    expect(strong).toBeDefined();
  });

  it("reveals bold markers once the cursor is on their line", () => {
    const doc = "# Title\n**bold** text\n";
    const wordFrom = doc.indexOf("bold");
    const v = view(doc, wordFrom); // cursor on line 2 -> active
    const hits = collect(v);

    const boldStart = doc.indexOf("**");
    const hiddenOpen = hits.find(
      (h) => h.isReplace && h.from === boldStart && h.to === boldStart + 2,
    );
    expect(hiddenOpen).toBeUndefined();

    // Styling persists even while editing the active line.
    const strong = hits.find((h) => h.spec.class === "cm-strong");
    expect(strong).toBeDefined();
  });

  it("emits a cm-em mark for emphasis", () => {
    const doc = "*em*";
    const v = view(doc, 0);
    const hits = collect(v);
    const em = hits.find((h) => h.spec.class === "cm-em");
    expect(em).toBeDefined();
  });

  it("replaces an inactive horizontal rule with an hr widget without throwing on mount", () => {
    const doc = "a\n\n---\n\nb\n";
    const hrFrom = doc.indexOf("---");
    // view() mounts a real EditorView with the plugin; a bad block decoration
    // would throw here during layout.
    const v = view(doc, 0); // cursor on line 1, HR line inactive
    const hits = collect(v);
    const hr = hits.find(
      (h) => h.from === hrFrom && (h.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(hr).toBeDefined();

    // Moving the cursor onto the HR line reveals the raw `---` (widget gone).
    v.dispatch({ selection: { anchor: hrFrom } });
    const revealed = collect(v).find(
      (h) => h.from === hrFrom && (h.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(revealed).toBeUndefined();
  });

  it("hides the heading marker together with its following space on an inactive line", () => {
    const doc = "## Title\nbody\n";
    const v = view(doc, doc.indexOf("body"));
    const hidden = collect(v).filter((h) => h.isReplace && h.from === 0);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.to).toBe("## ".length);
  });

  it("marks every raw table line and dims the delimiters while the caret is inside", () => {
    const doc = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const v = view(doc, doc.indexOf("1"));
    const hits = collect(v);
    const tableLines = hits.filter((h) => h.spec.class === "cm-table-line").map((h) => h.from);
    expect(tableLines).toEqual([0, doc.indexOf("|---"), doc.indexOf("| 1")]);
    const delimiterRow = hits.find(
      (h) => h.spec.class === "cm-table-pipe" && h.from === doc.indexOf("|---"),
    );
    expect(delimiterRow?.to).toBe(doc.indexOf("|---") + "|---|---|".length);
  });

  it("never hides a bare e-mail autolink, even off the active line", () => {
    const doc = "a\naryrabelo@gmail.com\nb\n";
    const addr = "aryrabelo@gmail.com";
    const addrFrom = doc.indexOf(addr);
    const v = view(doc, 0); // cursor on line 1; the address is on line 2 (inactive)
    const hits = collect(v);
    const hidden = hits.find(
      (h) => h.isReplace && h.from <= addrFrom && h.to >= addrFrom + addr.length,
    );
    expect(hidden).toBeUndefined();
    const styled = hits.find(
      (h) => h.spec.class === "cm-link" && h.from === addrFrom && h.to === addrFrom + addr.length,
    );
    expect(styled).toBeDefined();
  });

  it("never hides a bare https:// autolink, even off the active line", () => {
    const doc = "a\nhttps://example.com\nb\n";
    const url = "https://example.com";
    const urlFrom = doc.indexOf(url);
    const v = view(doc, 0);
    const hits = collect(v);
    const hidden = hits.find(
      (h) => h.isReplace && h.from <= urlFrom && h.to >= urlFrom + url.length,
    );
    expect(hidden).toBeUndefined();
    const styled = hits.find(
      (h) => h.spec.class === "cm-link" && h.from === urlFrom && h.to === urlFrom + url.length,
    );
    expect(styled).toBeDefined();
  });

  it("never hides a bare www. autolink, even off the active line", () => {
    const doc = "a\nwww.example.com\nb\n";
    const url = "www.example.com";
    const urlFrom = doc.indexOf(url);
    const v = view(doc, 0);
    const hits = collect(v);
    const hidden = hits.find(
      (h) => h.isReplace && h.from <= urlFrom && h.to >= urlFrom + url.length,
    );
    expect(hidden).toBeUndefined();
    const styled = hits.find(
      (h) => h.spec.class === "cm-link" && h.from === urlFrom && h.to === urlFrom + url.length,
    );
    expect(styled).toBeDefined();
  });

  it("hides only the angle brackets of a <https://…> autolink off the active line", () => {
    const doc = "a\n<https://example.com>\nb\n";
    const url = "https://example.com";
    const urlFrom = doc.indexOf(url);
    const openFrom = urlFrom - 1; // "<"
    const closeFrom = urlFrom + url.length; // ">"
    const v = view(doc, 0);
    const hits = collect(v);
    const hiddenUrl = hits.find(
      (h) => h.isReplace && h.from <= urlFrom && h.to >= urlFrom + url.length,
    );
    expect(hiddenUrl).toBeUndefined();
    const hiddenOpen = hits.find((h) => h.isReplace && h.from === openFrom && h.to === urlFrom);
    expect(hiddenOpen).toBeDefined();
    const hiddenClose = hits.find(
      (h) => h.isReplace && h.from === closeFrom && h.to === closeFrom + 1,
    );
    expect(hiddenClose).toBeDefined();
    const styled = hits.find(
      (h) => h.spec.class === "cm-link" && h.from === urlFrom && h.to === urlFrom + url.length,
    );
    expect(styled).toBeDefined();
  });

  it("hides only the angle brackets of a <a@b.co> autolink off the active line", () => {
    const doc = "a\n<a@b.co>\nb\n";
    const addr = "a@b.co";
    const addrFrom = doc.indexOf(addr);
    const v = view(doc, 0);
    const hits = collect(v);
    const hiddenAddr = hits.find(
      (h) => h.isReplace && h.from <= addrFrom && h.to >= addrFrom + addr.length,
    );
    expect(hiddenAddr).toBeUndefined();
    const hiddenOpen = hits.find(
      (h) => h.isReplace && h.from === addrFrom - 1 && h.to === addrFrom,
    );
    expect(hiddenOpen).toBeDefined();
  });

  it("hides the [text](url) destination off the active line and reveals it on the active line", () => {
    const doc = "a\n[text](https://example.com)\nb\n";
    const urlFrom = doc.indexOf("https://example.com");
    const urlTo = urlFrom + "https://example.com".length;
    const v = view(doc, 0); // cursor on line 1; the link is on line 2 (inactive)
    const hiddenOff = collect(v).find(
      (h) => h.isReplace && h.from === urlFrom && h.to === urlTo,
    );
    expect(hiddenOff).toBeDefined();

    v.dispatch({ selection: { anchor: urlFrom } }); // caret moves onto the link's line
    const hiddenOn = collect(v).find(
      (h) => h.isReplace && h.from === urlFrom && h.to === urlTo,
    );
    expect(hiddenOn).toBeUndefined();
  });

  it("keeps a link reference definition's URL visible, even off the active line", () => {
    const doc = "a\n[ref]: https://example.com\nb\n";
    const url = "https://example.com";
    const urlFrom = doc.indexOf(url);
    const v = view(doc, 0); // cursor on line 1; the definition is on line 2 (inactive)
    const hits = collect(v);
    const hidden = hits.find(
      (h) => h.isReplace && h.from <= urlFrom && h.to >= urlFrom + url.length,
    );
    expect(hidden).toBeUndefined();
    const styled = hits.find(
      (h) => h.spec.class === "cm-link" && h.from === urlFrom && h.to === urlFrom + url.length,
    );
    expect(styled).toBeDefined();
  });
});
