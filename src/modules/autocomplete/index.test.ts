import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry } from "@/lib/registry";
import { readFile } from "@/lib/tauri";
import { useStore } from "@/state/store";
import { GHOST_CLASS } from "./ghost";
import { autocompleteModule } from "./index";

const disk: Record<string, string> = {
  // The open note on disk. It must not feed suggestions: the live text does.
  "/vault/open.md": "o rio Tamanduá",
  "/vault/other.md": "Ontem vi o rio Tapajós.",
};

vi.mock("@/lib/tauri", () => ({
  readFile: vi.fn(async (path: string) => disk[path] ?? ""),
}));

const created: EditorView[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    root: "/vault",
    files: ["open.md", "other.md"],
    activePath: "open.md",
    content: "",
  });
});

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
  useStore.setState({ root: null, files: [], activePath: null, content: "" });
});

describe("autocomplete plugin", () => {
  it("registers its editor extension only while enabled", async () => {
    const reg = createRegistry();
    reg.register(autocompleteModule);
    await reg.activate("autocomplete");
    expect(reg.editorExtensions().length).toBeGreaterThan(0);

    reg.setEnabled("autocomplete", false);
    expect(reg.editorExtensions()).toEqual([]);

    reg.setEnabled("autocomplete", true);
    await Promise.resolve();
    expect(reg.editorExtensions().length).toBeGreaterThan(0);
  });

  it("suggests from the other notes of the open folder, never the open note's disk copy", async () => {
    const reg = createRegistry();
    reg.register(autocompleteModule);
    await reg.activate("autocomplete");
    expect(readFile).toHaveBeenCalledWith("/vault/other.md");
    expect(readFile).not.toHaveBeenCalledWith("/vault/open.md");

    const view = new EditorView({
      state: EditorState.create({
        extensions: [markdown({ base: markdownLanguage }), reg.editorExtensions() as Extension[]],
      }),
      parent: document.body,
    });
    created.push(view);
    view.dispatch({
      changes: { from: 0, insert: "o rio T" },
      selection: { anchor: 7 },
      userEvent: "input.type",
    });
    const ghost = () => view.contentDOM.querySelector(`.${GHOST_CLASS}`)?.textContent ?? null;
    // Notes load in the background; each caret set recomputes.
    await vi.waitFor(() => {
      view.dispatch({ selection: { anchor: 7 } });
      expect(ghost()).toBe("apajós");
    });

    // Switching to other.md makes it the live note, so its loaded copy drops out.
    useStore.setState({ activePath: "other.md" });
    view.dispatch({ selection: { anchor: 7 } });
    expect(ghost()).toBeNull();
  });
});
