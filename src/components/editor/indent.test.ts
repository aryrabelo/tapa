import { history, redo, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { ghostText } from "@/modules/autocomplete/ghost";
import { indentKeymap, tapaIndentLess, tapaIndentMore } from "./indent";

const created: EditorView[] = [];

function mount(doc: string, anchor: number, extra: Extension = []): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [history(), markdown({ base: markdownLanguage }), keymap.of(indentKeymap), extra],
  });
  const view = new EditorView({ state, parent: document.body });
  created.push(view);
  return view;
}

const text = (view: EditorView): string => view.state.doc.toString();
const press = (view: EditorView, key: string, shift = false): boolean =>
  runScopeHandlers(view, new KeyboardEvent("keydown", { key, shiftKey: shift }), "editor");

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
});

describe("tapaIndentMore / tapaIndentLess", () => {
  it("nests a bullet item under the bullet item directly above it", () => {
    const doc = "- a\n- b\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("- a\n  - b\n");
  });

  it("nests an ordered item under the ordered item directly above it", () => {
    const doc = "1. a\n2. b\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("1. a\n   2. b\n");
  });

  it("keeps the caret right before the marker when it starts at the line's own start", () => {
    const doc = "- a\n- b\n";
    const lineStart = doc.indexOf("- b\n");
    const v = mount(doc, lineStart);
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("- a\n  - b\n");
    expect(v.state.selection.main.head).toBe(lineStart + 2);
  });

  it("nests a bullet item under an ordered item directly above it (mixed markers)", () => {
    const doc = "1. a\n- b\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("1. a\n   - b\n");
  });

  it("does nothing to the first item of a list (no item above)", () => {
    const doc = "- a\n- b\n";
    const v = mount(doc, doc.indexOf("a"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe(doc);
  });

  it("does nothing to an item already the first child (no sibling above it)", () => {
    const doc = "- a\n  - b\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe(doc);
  });

  it("moves an item's continuation lines and nested children with it", () => {
    const doc = "- a\n- b\n  continuation\n  - child\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("- a\n  - b\n    continuation\n    - child\n");
  });

  it("un-nests an item to its parent's indentation", () => {
    const doc = "- a\n  - b\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentLess(v)).toBe(true);
    expect(text(v)).toBe("- a\n- b\n");
  });

  it("does nothing to a top-level item on Shift-Tab", () => {
    const doc = "- a\n- b\n";
    const v = mount(doc, doc.indexOf("a"));
    expect(tapaIndentLess(v)).toBe(true);
    expect(text(v)).toBe(doc);
  });

  it("nests every sibling item touched by a multi-item selection", () => {
    const doc = "- a\n- b\n- c\n";
    const v = mount(doc, 0);
    v.dispatch({ selection: { anchor: doc.indexOf("b"), head: doc.indexOf("c") + 1 } });
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("- a\n  - b\n  - c\n");
  });

  it("inserts two spaces at the caret inside a fenced code block", () => {
    const doc = "```js\ncode\n```\n";
    const v = mount(doc, doc.indexOf("code"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("```js\n  code\n```\n");
  });
  it("leaves the caret after the two inserted spaces, so a second Tab inserts after it", () => {
    const doc = "```js\nfoo\n```\n";
    const pos = doc.indexOf("foo") + 3; // caret right after "foo"
    const v = mount(doc, pos);
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("```js\nfoo  \n```\n");
    expect(v.state.selection.main.head).toBe(pos + 2);
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("```js\nfoo    \n```\n");
  });


  it("indents every selected line by two spaces inside a fenced code block", () => {
    const doc = "```js\none\ntwo\n```\n";
    const v = mount(doc, doc.indexOf("one"));
    v.dispatch({ selection: { anchor: doc.indexOf("one"), head: doc.indexOf("two") + 3 } });
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("```js\n  one\n  two\n```\n");
  });

  it("removes up to two leading spaces per selected line inside a fenced code block", () => {
    const doc = "```js\n   one\n two\n```\n";
    const v = mount(doc, doc.indexOf("one"));
    v.dispatch({ selection: { anchor: doc.indexOf("one"), head: doc.indexOf("two") + 3 } });
    expect(tapaIndentLess(v)).toBe(true);
    expect(text(v)).toBe("```js\n one\ntwo\n```\n");
  });

  it("leaves a paragraph untouched but consumes the key", () => {
    const doc = "Just a paragraph of text.\n";
    const v = mount(doc, doc.indexOf("paragraph"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe(doc);
    expect(tapaIndentLess(v)).toBe(true);
    expect(text(v)).toBe(doc);
  });

  it("leaves a blank line untouched but consumes the key", () => {
    const doc = "a\n\nb\n";
    const v = mount(doc, 2);
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe(doc);
  });

  it("restores the original text with one undo", () => {
    const doc = "- a\n- b\n";
    const v = mount(doc, doc.indexOf("b"));
    expect(tapaIndentMore(v)).toBe(true);
    expect(text(v)).toBe("- a\n  - b\n");
    expect(undo(v)).toBe(true);
    expect(text(v)).toBe(doc);
    expect(redo(v)).toBe(true);
    expect(text(v)).toBe("- a\n  - b\n");
  });

  it("accepts a visible ghost suggestion on Tab, and indents when there is none", () => {
    const doc = "- a\n- bol\n";
    const v = mount(doc, doc.indexOf("bol") + 3, ghostText(() => ["bold move"]));
    // The caret is right after "bol", which continues a note's "bold move": a ghost shows.
    expect(press(v, "Tab")).toBe(true);
    expect(text(v)).toContain("bold move");

    // No matching note: no ghost, so Tab falls through to the list-indent command.
    const v2 = mount("- a\n- b\n", "- a\n- b\n".indexOf("b"), ghostText(() => []));
    expect(press(v2, "Tab")).toBe(true);
    expect(text(v2)).toBe("- a\n  - b\n");
  });
});
