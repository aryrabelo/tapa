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

  it("lets a slow load finish before starting the one for the folder it was switched to", async () => {
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
    ghost(); // the next edit/caret move is what notices the rescan
    // The slow load has not landed yet, so no second load has started: it is
    // allowed to finish first, not cancelled.
    expect(readFile).not.toHaveBeenCalledWith("/elsewhere/b.md");

    finishSlow("o rio Tapajós.");
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledWith("/elsewhere/b.md"));
    await vi.waitFor(() => expect(ghost()).toBe("ocantins."));
  });

  it("a rescan that lists the same files in a new array changes nothing", async () => {
    const { ghost } = await typedEditor();
    await vi.waitFor(() => expect(ghost()).toBe("apajós."));
    vi.mocked(readFile).mockClear();

    // What `setFolder` builds on every rescan, even when nothing changed on disk.
    useStore.setState({ files: [...useStore.getState().files] });
    expect(ghost()).toBe("apajós.");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("keeps serving the loaded corpus while an added file loads, then folds it in", async () => {
    const { ghost } = await typedEditor();
    await vi.waitFor(() => expect(ghost()).toBe("apajós."));
    vi.mocked(readFile).mockClear();

    let finishExtra: (text: string) => void = () => {};
    const slowExtra = new Promise<string>((resolve) => {
      finishExtra = resolve;
    });
    vi.mocked(readFile).mockImplementation((path) =>
      path === "/vault/extra.md" ? slowExtra : fromDisk(path),
    );
    useStore.setState({ files: ["open.md", "other.md", "extra.md"] });
    ghost(); // the next edit/caret move is what notices the rescan

    await vi.waitFor(() => expect(readFile).toHaveBeenCalledWith("/vault/extra.md"));
    // Still serving the old corpus while the new file loads, and the file
    // already in it is reused from cache, not read again.
    expect(ghost()).toBe("apajós.");
    expect(readFile).not.toHaveBeenCalledWith("/vault/other.md");

    finishExtra("Vi o rio Trombetas. Vi o rio Trombetas.");
    await vi.waitFor(() => expect(ghost()).toBe("rombetas."));
  });

  it("stops suggesting a removed file once the reload for the shorter list lands", async () => {
    vi.mocked(readFile).mockImplementation((path) =>
      path === "/vault/extra2.md"
        ? Promise.resolve("Vi o rio Trombetas. Vi o rio Trombetas.")
        : fromDisk(path),
    );
    useStore.setState({ files: ["open.md", "other.md", "extra2.md"] });
    const { ghost } = await typedEditor();
    await vi.waitFor(() => expect(ghost()).toBe("rombetas."));

    useStore.setState({ files: ["open.md", "other.md"] }); // extra2.md dropped
    // The reload for the shorter list has not landed yet; the old (longer)
    // corpus still answers until it does.
    expect(ghost()).toBe("rombetas.");

    await vi.waitFor(() => expect(ghost()).toBe("apajós."));
  });

  it("coalesces several list changes while a load is pending into at most one more load", async () => {
    let finishSlow: (text: string) => void = () => {};
    const slow = new Promise<string>((resolve) => {
      finishSlow = resolve;
    });
    vi.mocked(readFile).mockImplementation((path) =>
      path === "/slow/x.md" ? slow : fromDisk(path),
    );
    useStore.setState({ root: "/slow", files: ["x.md"], activePath: null });
    const { ghost } = await typedEditor();
    expect(readFile).toHaveBeenCalledTimes(1);

    // Three changes land while the first load is still in flight; only the
    // last one may ever start a second load.
    useStore.setState({ root: "/elsewhere", files: ["b.md"] });
    ghost();
    useStore.setState({ root: "/elsewhere", files: ["b.md", "c.md"] });
    ghost();
    useStore.setState({ root: "/vault", files: ["other.md"], activePath: null });
    ghost();
    expect(readFile).toHaveBeenCalledTimes(1); // still only the first, slow load

    finishSlow("o rio Tapajós.");
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
    expect(readFile).toHaveBeenCalledWith("/vault/other.md");
    expect(readFile).not.toHaveBeenCalledWith("/elsewhere/b.md");
    expect(readFile).not.toHaveBeenCalledWith("/elsewhere/c.md");
    await vi.waitFor(() => expect(ghost()).toBe("apajós."));
  });

  it("drops the old folder's text once a load for the new root lands", async () => {
    const { ghost } = await typedEditor();
    await vi.waitFor(() => expect(ghost()).toBe("apajós."));

    useStore.setState({ root: "/elsewhere", files: ["b.md"], activePath: null });
    await vi.waitFor(() => expect(ghost()).toBe("ocantins."));
  });
});
