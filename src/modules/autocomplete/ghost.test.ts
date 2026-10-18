import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { GHOST_CLASS, ghostText } from "./ghost";

const created: EditorView[] = [];

function mount(doc: string, notes: string[] = []): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), ghostText(() => notes)],
  });
  const view = new EditorView({ state, parent: document.body });
  created.push(view);
  return view;
}

/** Type `text` at the caret one character at a time, like a person would. */
function type(view: EditorView, text: string): void {
  for (const ch of text) {
    const at = view.state.selection.main.head;
    view.dispatch({
      changes: { from: at, insert: ch },
      selection: { anchor: at + ch.length },
      userEvent: "input.type",
    });
  }
}

const ghost = (view: EditorView): string | null =>
  view.contentDOM.querySelector(`.${GHOST_CLASS}`)?.textContent ?? null;

const press = (view: EditorView, key: string): boolean =>
  runScopeHandlers(view, new KeyboardEvent("keydown", { key }), "editor");

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
});

describe("ghost text in the editor", () => {
  it("offers 'apajós' after 'o rio T' and Tab completes the document", () => {
    const view = mount("Ontem vi o rio Tapajós.\n\n");
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós");
    expect(view.state.doc.toString()).toBe("Ontem vi o rio Tapajós.\n\no rio T");

    expect(press(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("Ontem vi o rio Tapajós.\n\no rio Tapajós");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(ghost(view)).toBeNull();
  });

  it("uses the other notes, not only the open one", () => {
    const view = mount("", ["Ontem vi o rio Tapajós."]);
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós");
  });

  it("Esc hides the ghost without touching the document, until the next edit", () => {
    const view = mount("o rio Tapajós\n");
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós");

    expect(press(view, "Escape")).toBe(true);
    expect(ghost(view)).toBeNull();
    expect(view.state.doc.toString()).toBe("o rio Tapajós\no rio T");
    // Tab now has nothing to accept, so it is left to the editor's default.
    expect(press(view, "Tab")).toBe(false);
    expect(view.state.doc.toString()).toBe("o rio Tapajós\no rio T");

    type(view, "a");
    expect(ghost(view)).toBe("pajós");
  });

  it("leaves Tab and Esc alone when there is no ghost", () => {
    const view = mount("nada aqui\n");
    type(view, "xyz");
    expect(ghost(view)).toBeNull();
    expect(press(view, "Tab")).toBe(false);
    expect(press(view, "Escape")).toBe(false);
    expect(view.state.doc.toString()).toBe("nada aqui\nxyz");
  });

  it("shows nothing while text is selected", () => {
    const view = mount("o rio Tapajós\n");
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós");
    const end = view.state.doc.length;
    view.dispatch({ selection: { anchor: end - 3, head: end } });
    expect(ghost(view)).toBeNull();
    expect(press(view, "Tab")).toBe(false);
    expect(view.state.doc.toString()).toBe("o rio Tapajós\no rio T");
  });

  it("recomputes on a caret move: nothing in the middle of a word", () => {
    const view = mount("o rio Tapajós\n");
    type(view, "o rio Ta");
    expect(ghost(view)).toBe("pajós");
    const end = view.state.doc.length;
    view.dispatch({ selection: { anchor: end - 1 } });
    expect(ghost(view)).toBeNull();
    view.dispatch({ selection: { anchor: end } });
    expect(ghost(view)).toBe("pajós");
  });

  it("shows nothing inside a fenced code block", () => {
    const view = mount("o rio Tapajós\n\n```\n");
    type(view, "o rio T");
    expect(view.state.doc.toString()).toBe("o rio Tapajós\n\n```\no rio T");
    expect(ghost(view)).toBeNull();
  });
});
