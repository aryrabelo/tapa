import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRecents, pushRecent } from "@/lib/recent";
import { createRegistry } from "@/lib/registry";
import { readFile } from "@/lib/tauri";
import { useStore } from "@/state/store";
import { GHOST_CLASS } from "./ghost";
import { autocompleteModule } from "./index";

const disk: Record<string, string> = {
  // The open note on disk. It must not feed suggestions: the live text does.
  "/vault/open.md": "o rio Tamanduá",
  "/vault/other.md": "Ontem vi o rio Tapajós.",
  "/loose/a.md": "o rio Tamanduá",
  "/elsewhere/b.md": "Passei pelo rio Tocantins.",
  "/elsewhere/c.md": "Nadei no rio Tietê.",
  "/elsewhere/notes.txt": "o rio Trombetas.",
};

const fromDisk = async (path: string): Promise<string> => {
  const text = disk[path];
  if (text === undefined) throw new Error(`no such file: ${path}`);
  return text;
};

vi.mock("@/lib/tauri", () => ({
  readFile: vi.fn(),
  setRecentMenu: vi.fn(async () => {}),
}));

const created: EditorView[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockImplementation(fromDisk);
  clearRecents();
  useStore.setState({
    root: "/vault",
    single: false,
    files: ["open.md", "other.md"],
    openFiles: [],
    activePath: "open.md",
    content: "",
  });
});

afterEach(() => {
  for (const v of created.splice(0)) v.destroy();
  clearRecents();
  useStore.setState({
    root: null,
    single: false,
    files: [],
    openFiles: [],
    activePath: null,
    content: "",
  });
});

/** An editor with the plugin on and "o rio T" typed; `ghost()` re-reads the suggestion. */
async function typedEditor() {
  const reg = createRegistry();
  reg.register(autocompleteModule);
  await reg.activate("autocomplete");
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
  // Each caret set recomputes the suggestion against the current corpus.
  const ghost = () => {
    view.dispatch({ selection: { anchor: 7 } });
    return view.contentDOM.querySelector(`.${GHOST_CLASS}`)?.textContent ?? null;
  };
  return { ghost };
}

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
    const { ghost } = await typedEditor();
    expect(readFile).toHaveBeenCalledWith("/vault/other.md");
    expect(readFile).not.toHaveBeenCalledWith("/vault/open.md");
    // Notes load in the background.
    await vi.waitFor(() => expect(ghost()).toBe("apajós."));

    // Switching to other.md makes it the live note, so its loaded copy drops out.
    useStore.setState({ activePath: "other.md" });
    expect(ghost()).toBeNull();
  });

  it("single-file mode learns from the other open files, never the active one's disk copy", async () => {
    useStore.setState({
      root: "/loose",
      single: true,
      files: ["a.md"],
      openFiles: ["/loose/a.md", "/elsewhere/b.md"],
      activePath: "a.md",
    });
    pushRecent("/loose/a.md"); // opening a file also makes it recent
    const { ghost } = await typedEditor();
    await vi.waitFor(() => expect(ghost()).toBe("ocantins."));
    expect(readFile).toHaveBeenCalledWith("/elsewhere/b.md");
    expect(readFile).not.toHaveBeenCalledWith("/loose/a.md");
  });

  it("learns recent Markdown files, skipping recent folders, other files and the open note", async () => {
    useStore.setState({ files: ["open.md"] });
    const { ghost } = await typedEditor();
    expect(ghost()).toBeNull();

    // The recent list changing reloads the corpus.
    pushRecent("/projects");
    pushRecent("/elsewhere/notes.txt");
    pushRecent("/vault/open.md");
    pushRecent("/elsewhere/c.md");
    await vi.waitFor(() => expect(ghost()).toBe("ietê."));
    expect(readFile).not.toHaveBeenCalledWith("/projects");
    expect(readFile).not.toHaveBeenCalledWith("/elsewhere/notes.txt");
    expect(readFile).not.toHaveBeenCalledWith("/vault/open.md");
  });

  it("skips a recent file that can't be read and keeps the rest", async () => {
    useStore.setState({ files: ["open.md"] });
    pushRecent("/elsewhere/b.md");
    pushRecent("/gone.md"); // newest, so read first, and it fails
    const { ghost } = await typedEditor();
    await vi.waitFor(() => expect(ghost()).toBe("ocantins."));
    expect(readFile).toHaveBeenCalledWith("/gone.md");
  });

  it("drops a load that finishes after the folder changed", async () => {
    // ES2022 lib: no Promise.withResolvers.
    let finishSlow: (text: string) => void = () => {};
    const slow = new Promise<string>((resolve) => {
      finishSlow = resolve;
    });
    vi.mocked(readFile).mockImplementation((path) =>
      path === "/slow/x.md" ? slow : fromDisk(path),
    );
    useStore.setState({ root: "/slow", files: ["x.md"], activePath: null });
    const { ghost } = await typedEditor();
    expect(readFile).toHaveBeenCalledWith("/slow/x.md");

    useStore.setState({ root: "/elsewhere", files: ["b.md"] });
    await vi.waitFor(() => expect(ghost()).toBe("ocantins."));

    // The old folder's read comes back last; it must not replace the new corpus.
    finishSlow("o rio Tapajós.");
    // The stale load settles through microtasks only; one macrotask turn drains them all.
    await new Promise((r) => setTimeout(r, 0));
    expect(ghost()).toBe("ocantins.");
  });
});
