import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type Extension, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ghostText } from "@/modules/autocomplete/ghost";
import { dimOtherSentences, keepLineCentred, sentenceAt } from "./focus";
import "./jsdom-layout";

const created: EditorView[] = [];
// The scroll effect's type is internal to CodeMirror; its value's class is
// reachable through the public EditorView.scrollIntoView.
const ScrollTarget = (EditorView.scrollIntoView(0).value as object).constructor;
interface Target {
  range: { head: number };
  y: string;
}

function mount(doc: string, caret: number, extensions: Extension[]) {
  const seen: Transaction[] = [];
  const state = EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [
      markdown({ base: markdownLanguage }),
      extensions,
      EditorView.updateListener.of((u) => seen.push(...u.transactions)),
    ],
  });
  const view = new EditorView({ state, parent: document.body });
  created.push(view);
  return { view, seen };
}

/** Text the reader sees at full contrast (`dimmed` false) or faded (true). */
function textBy(view: EditorView, dimmed: boolean): string {
  const walker = document.createTreeWalker(view.contentDOM, NodeFilter.SHOW_TEXT);
  let out = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n.parentElement?.closest(".cm-tapa-dim") != null) === dimmed) out += n.textContent;
  }
  return out;
}

/** Positions the scroll effects of these transactions ask to centre. */
const centred = (trs: readonly Transaction[]) =>
  trs.flatMap((tr) =>
    tr.effects
      .map((e) => e.value)
      .filter((v): v is Target => v instanceof ScrollTarget && "y" in v && v.y === "center")
      .map((v) => v.range.head),
  );

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
});

const THREE = "First one is short. Second one sits here! Third ends it.";

/**
 * Left-border widths, in px, that stylesheet rules scoped to one of
 * `rootClasses` give `el`. Reads the live CSSOM; jsdom's getComputedStyle
 * does not resolve borders.
 */
function borderWidthsFrom(rootClasses: readonly string[], el: Element): number[] {
  const widths: number[] = [];
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule) || !el.matches(rule.selectorText)) continue;
      if (!rootClasses.some((c) => rule.selectorText.includes(`.${c}`))) continue;
      const width = Number.parseFloat(rule.style.borderLeftWidth);
      if (!Number.isNaN(width)) widths.push(width);
    }
  }
  return widths;
}

describe("dimming", () => {
  it("lights only the caret's sentence and follows the caret", () => {
    const { view } = mount(THREE, THREE.indexOf("sits"), [dimOtherSentences()]);
    expect(textBy(view, false).trim()).toBe("Second one sits here!");
    expect(textBy(view, true)).toBe("First one is short. Third ends it.");

    view.dispatch({ selection: { anchor: THREE.indexOf("ends") }, userEvent: "select" });
    expect(textBy(view, false)).toBe("Third ends it.");
    expect(textBy(view, true)).toBe("First one is short. Second one sits here! ");
  });

  it("keeps the head's sentence lit when a selection spans several", () => {
    const { view } = mount(THREE, 0, [dimOtherSentences()]);
    view.dispatch({ selection: { anchor: 2, head: THREE.indexOf("ends") } });
    expect(textBy(view, false)).toBe("Third ends it.");
  });

  it("stops at blank lines, headings and list items", () => {
    const doc = "# Title. Still title\nLine one\ncontinues. Next.\n\n- item one. Two\n- item three";
    const state = EditorState.create({ doc });
    const at = (word: string) => {
      const r = sentenceAt(state, doc.indexOf(word));
      return r && doc.slice(r.from, r.to);
    };
    expect(at("Still")).toBe("Still title");
    expect(at("continues")).toBe("Line one\ncontinues. ");
    expect(at("Two")).toBe("Two");
    expect(at("three")).toBe("- item three");
    expect(sentenceAt(state, doc.indexOf("\n\n") + 1)).toBeNull();
  });

  it("never fades the autocomplete ghost on the lit sentence", () => {
    const notes = ["Ontem vi o rio Tapajós."];
    // Ghost first, as in the app (autocomplete boots before focus). In this
    // order a dim mark over the caret would wrap the ghost; in the other order
    // CodeMirror draws the widget outside the mark, so that order proves nothing.
    // Caret mid-line before a space, and at a line end with a paragraph after.
    for (const doc of ["Antes. o rio T depois disso. Fim.", "Antes. o rio T\n\nOutro parágrafo."]) {
      const caret = doc.indexOf("o rio T") + "o rio T".length;
      const { view } = mount(doc, caret, [ghostText(() => notes), dimOtherSentences()]);
      const ghost = view.contentDOM.querySelector(".cm-tapa-ghost");
      expect(ghost?.textContent).toBe("apajós");
      expect(ghost?.closest(".cm-tapa-dim")).toBeNull();
      expect(textBy(view, true)).toContain("Antes.");
    }
  });
});

describe("caret", () => {
  it("draws a thick, steady caret only while dimming is on", async () => {
    const plain = mount(THREE, 3, []).view;
    const { view } = mount(THREE, 3, [dimOtherSentences()]);
    // Classes the extension adds to the editor root: its theme scopes.
    const added = [...view.dom.classList].filter((c) => !plain.dom.classList.contains(c));

    view.focus();
    await vi.waitFor(() => expect(view.dom.querySelector(".cm-cursor-primary")).not.toBeNull());
    const caret = view.dom.querySelector(".cm-cursor-primary") as Element;
    expect(Math.max(0, ...borderWidthsFrom(added, caret))).toBeGreaterThanOrEqual(2);
    // CodeMirror writes the blink cycle onto the layer; 0 means it never blinks.
    const layer = view.dom.querySelector(".cm-cursorLayer") as HTMLElement;
    expect(layer.style.animationDuration).toBe("0ms");
    expect(caret.closest(".cm-tapa-dim")).toBeNull();

    // Without the extension the browser's own caret is used: nothing drawn.
    plain.focus();
    expect(plain.hasFocus).toBe(true);
    expect(plain.dom.querySelector(".cm-cursorLayer")).toBeNull();
  });
});

describe("typewriter", () => {
  it("asks to centre the caret line on typing and keyboard moves", () => {
    const { view, seen } = mount(THREE, 0, [keepLineCentred()]);
    view.dispatch({
      changes: { from: 0, insert: "A" },
      selection: { anchor: 1 },
      userEvent: "input.type",
    });
    view.dispatch({ selection: { anchor: 30 }, userEvent: "select" });
    expect(centred(seen)).toEqual([1, 30]);
  });

  it("leaves clicks and changes made by code alone", () => {
    const { view, seen } = mount(THREE, 0, [keepLineCentred()]);
    view.dispatch({ selection: { anchor: 10 }, userEvent: "select.pointer" });
    view.dispatch({ changes: { from: 0, insert: "reload " } });
    expect(centred(seen)).toEqual([]);
  });

  it("centres the caret line once when the extension arrives", async () => {
    const { seen } = mount(THREE, 30, [keepLineCentred()]);
    await vi.waitFor(() => expect(centred(seen)).toEqual([30]));
  });

  it("pads the content so the first and last lines can reach the middle", () => {
    const { view } = mount(THREE, 0, [keepLineCentred()]);
    expect(view.contentDOM.style.paddingTop).toBe("50vh");
    expect(view.contentDOM.style.paddingBottom).toBe("50vh");
  });
});
