import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { buildDecorations, livePreview } from "./live-preview";

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
    extensions: [markdown(), livePreview],
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
});
