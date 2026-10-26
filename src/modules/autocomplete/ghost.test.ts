import { history, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCEPTED_CLASS,
  AI_GHOST_CLASS,
  GHOST_CLASS,
  GLOW_MS,
  ghostText,
  REMOTE_DELAY_MS,
  type RemoteSuggest,
} from "./ghost";

const created: EditorView[] = [];

function mount(doc: string, notes: string[] = [], extra: Extension = []): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), ghostText(() => notes), extra],
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
  vi.useRealTimers();
});

/** Text of every glowing span, in document order. */
const glowing = (view: EditorView): string[] =>
  Array.from(view.contentDOM.querySelectorAll(`.${ACCEPTED_CLASS}`), (el) => el.textContent ?? "");

/** Type `prefix`, then Tab the ghost; returns what Tab inserted. */
function acceptAfter(view: EditorView, prefix: string): string {
  type(view, prefix);
  const offered = ghost(view);
  expect(offered).toBeTruthy();
  expect(press(view, "Tab")).toBe(true);
  return offered as string;
}

// Only timeouts: faking requestAnimationFrame too makes the view run its
// layout measuring, which jsdom cannot do.
const useFakeTimeouts = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

describe("the glow on accepted text", () => {
  it("wraps exactly the inserted text, not the typed prefix or what comes after", () => {
    const view = mount("o rio Tapajós\n");
    const inserted = acceptAfter(view, "o rio T");
    expect(view.state.doc.toString()).toBe(`o rio Tapajós\no rio T${inserted}`);
    expect(glowing(view)).toEqual([inserted]);

    type(view, " x");
    expect(glowing(view)).toEqual([inserted]);
  });

  it("is gone once the glow time has passed", () => {
    useFakeTimeouts();
    const view = mount("o rio Tapajós\n");
    const inserted = acceptAfter(view, "o rio T");
    vi.advanceTimersByTime(GLOW_MS - 1);
    expect(glowing(view)).toEqual([inserted]);
    vi.advanceTimersByTime(1);
    expect(glowing(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(`o rio Tapajós\no rio T${inserted}`);
  });

  it("follows the text when the document changes before it, and drops when deleted", () => {
    const view = mount("o rio Tapajós\n");
    const inserted = acceptAfter(view, "o rio T");
    view.dispatch({ changes: { from: 0, insert: "Hoje vi " } });
    expect(glowing(view)).toEqual([inserted]);

    const end = view.state.doc.length;
    view.dispatch({ changes: { from: end - inserted.length, to: end } });
    expect(glowing(view)).toEqual([]);
  });

  it("drops when the whole phrase is selected and typed over", () => {
    const view = mount("o rio Tapajós\n");
    const inserted = acceptAfter(view, "o rio T");
    const end = view.state.doc.length;
    view.dispatch({
      changes: { from: end - inserted.length, to: end, insert: "x" },
      userEvent: "input.type",
    });
    expect(view.state.doc.toString()).toBe("o rio Tapajós\no rio Tx");
    expect(glowing(view)).toEqual([]);
  });

  it("keeps glowing when only part of the phrase is replaced", () => {
    const view = mount("o rio Tapajós\n");
    const inserted = acceptAfter(view, "o rio T");
    const end = view.state.doc.length;
    view.dispatch({
      changes: { from: end - 2, to: end - 1, insert: "x" },
      userEvent: "input.type",
    });
    expect(glowing(view)).toEqual([`${inserted.slice(0, -2)}x${inserted.slice(-1)}`]);
  });

  it("does not appear when Tab had no ghost to accept", () => {
    const view = mount("nada aqui\n");
    type(view, "xyz");
    expect(press(view, "Tab")).toBe(false);
    expect(glowing(view)).toEqual([]);
  });

  it("adds no undo step: one undo removes the accepted text and its glow", () => {
    const view = mount("o rio Tapajós\n", [], history());
    acceptAfter(view, "o rio T");
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("o rio Tapajós\no rio T");
    expect(glowing(view)).toEqual([]);
  });

  it("leaves no timer behind when the editor is destroyed mid-glow", () => {
    useFakeTimeouts();
    const view = mount("o rio Tapajós\n");
    acceptAfter(view, "o rio T");
    const dispatch = vi.spyOn(view, "dispatch");
    view.destroy();
    vi.advanceTimersByTime(GLOW_MS * 2);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("ghost text in the editor", () => {
  it("offers 'apajós' after 'o rio T' and Tab completes the document", () => {
    const view = mount("Ontem vi o rio Tapajós.\n\n");
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós.");
    expect(view.state.doc.toString()).toBe("Ontem vi o rio Tapajós.\n\no rio T");

    expect(press(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("Ontem vi o rio Tapajós.\n\no rio Tapajós.");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(ghost(view)).toBeNull();
  });

  it("uses the other notes, not only the open one", () => {
    const view = mount("", ["Ontem vi o rio Tapajós."]);
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós.");
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

describe("the remote (AI) ghost", () => {
  function mountRemote(doc: string, remote: RemoteSuggest, notes: string[] = []): EditorView {
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown({ base: markdownLanguage }), ghostText(() => notes, remote)],
    });
    const view = new EditorView({ state, parent: document.body });
    created.push(view);
    return view;
  }

  /** Lets a resolved remote promise reach the editor. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  function pending() {
    let resolve: (text: string | null) => void = () => {};
    let signal: AbortSignal | null = null;
    const remote = vi.fn<RemoteSuggest>((_before, _after, s) => {
      signal = s;
      return new Promise((r) => {
        resolve = r;
      });
    });
    return { remote, resolve: (t: string | null) => resolve(t), signal: () => signal };
  }

  const isAi = (view: EditorView): boolean =>
    view.contentDOM.querySelector(`.${GHOST_CLASS}`)?.classList.contains(AI_GHOST_CLASS) ?? false;

  it("is not asked when the notes have a suggestion", () => {
    useFakeTimeouts();
    const remote = vi.fn<RemoteSuggest>(async () => " nunca.");
    const view = mountRemote("o rio Tapajós\n", remote);
    type(view, "o rio T");
    expect(ghost(view)).toBe("apajós");
    vi.advanceTimersByTime(REMOTE_DELAY_MS * 2);
    expect(remote).not.toHaveBeenCalled();
    expect(isAi(view)).toBe(false);
  });

  it("is asked only after a pause, and its answer is shown as an AI ghost Tab accepts", async () => {
    useFakeTimeouts();
    const remote = vi.fn<RemoteSuggest>(async () => " ficou calmo.");
    const view = mountRemote("Primeira linha.\n", remote);
    type(view, "O rio");
    vi.advanceTimersByTime(REMOTE_DELAY_MS - 1);
    expect(remote).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledWith("Primeira linha.\nO rio", "", expect.any(AbortSignal));

    await settle();
    expect(ghost(view)).toBe(" ficou calmo.");
    expect(isAi(view)).toBe(true);

    expect(press(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("Primeira linha.\nO rio ficou calmo.");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(ghost(view)).toBeNull();
    expect(glowing(view)).toEqual([" ficou calmo."]);
    // Accepting is not typing, so it does not ask again.
    vi.advanceTimersByTime(REMOTE_DELAY_MS * 2);
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("typing aborts the request in flight", () => {
    useFakeTimeouts();
    const p = pending();
    const view = mountRemote("", p.remote);
    type(view, "Hello");
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    expect(p.signal()?.aborted).toBe(false);
    type(view, "!");
    expect(p.signal()?.aborted).toBe(true);
  });

  it("drops an answer that arrives after more typing", async () => {
    useFakeTimeouts();
    const p = pending();
    const view = mountRemote("", p.remote);
    type(view, "Hello");
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    type(view, "!");
    p.resolve(" world.");
    await settle();
    expect(ghost(view)).toBeNull();
    expect(view.state.doc.toString()).toBe("Hello!");
  });

  it("drops an answer that arrives after the caret moved", async () => {
    useFakeTimeouts();
    const p = pending();
    const view = mountRemote("Hello", p.remote);
    type(view, " there");
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    view.dispatch({ selection: { anchor: 2 } });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    p.resolve(" friend.");
    await settle();
    expect(ghost(view)).toBeNull();
  });

  it("Esc hides an AI ghost like any other", async () => {
    useFakeTimeouts();
    const view = mountRemote("", async () => " world.");
    type(view, "Hello");
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    await settle();
    expect(ghost(view)).toBe(" world.");
    expect(press(view, "Escape")).toBe(true);
    expect(ghost(view)).toBeNull();
    expect(press(view, "Tab")).toBe(false);
    expect(view.state.doc.toString()).toBe("Hello");
  });

  it("is not asked in the middle of a word, on a blank line or inside code", () => {
    useFakeTimeouts();
    const remote = vi.fn<RemoteSuggest>(async () => null);
    const view = mountRemote("Hello world\n\n```\n", remote);
    view.dispatch({ selection: { anchor: 3 } });
    type(view, "x"); // "Helxlo": the caret is inside a word
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    view.dispatch({ selection: { anchor: 13 } });
    type(view, " "); // only a space on the line
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    type(view, "code");
    vi.advanceTimersByTime(REMOTE_DELAY_MS);
    expect(remote).not.toHaveBeenCalled();
  });
});
