import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Capture listener callbacks so tests can invoke them directly.
type Listener = ((ev: { payload: unknown }) => unknown) | null;
let fileChangedCb: Listener = null;
let openFilesCb: Listener = null;
let menuCb: Listener = null;
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: Listener) => {
    if (event === "file-changed") fileChangedCb = cb;
    if (event === "open-files") openFilesCb = cb;
    if (event === "menu") menuCb = cb;
    return Promise.resolve(() => {});
  }),
}));
vi.mock("@/lib/tauri", () => ({
  scanTree: vi.fn(),
  readFile: vi.fn(),
  rememberVersion: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(),
  createPath: vi.fn(),
  watchFolder: vi.fn(),
  takePendingOpen: vi.fn(() => Promise.resolve([])),
  pickFolder: vi.fn(() => Promise.resolve(null)),
  pickFile: vi.fn(() => Promise.resolve(null)),
  pickSavePath: vi.fn(() => Promise.resolve(null)),
  pathKind: vi.fn(),
  setRecentMenu: vi.fn(() => Promise.resolve()),
  confirmAction: vi.fn(),
  renamePath: vi.fn(),
  revealPath: vi.fn(),
  trashPath: vi.fn(),
}));
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
// Stub the CodeMirror-backed Editor so jsdom never instantiates it; expose the
// exit/save handlers as plain buttons so the shell wiring can be driven.
vi.mock("@/components/editor/Editor", () => ({
  Editor: ({ onSave, onBlurSave }: { onSave: () => void; onBlurSave: () => void }) => (
    <div data-testid="editor-stub">
      <button type="button" onClick={onSave}>
        save
      </button>
      <button type="button" onClick={() => onBlurSave()}>
        blur
      </button>
    </div>
  ),
}));

import { listen } from "@tauri-apps/api/event";
import {
  createPath,
  pathKind,
  pickFolder,
  pickSavePath,
  readFile,
  scanTree,
  takePendingOpen,
  watchFolder,
  writeFile,
} from "@/lib/tauri";
import { toast } from "sonner";
import App from "./App";
import { clearRecents, pushRecent } from "@/lib/recent";
import { registry } from "@/lib/registry";
import { filesModule } from "@/modules/files";
import { autosave } from "@/modules/files/actions";
import { useStore } from "@/state/store";

// The integrator lists the module in the plugin manifest; register it here directly.
registry.register(filesModule);

beforeEach(() => {
  vi.clearAllMocks();
  fileChangedCb = null;
  openFilesCb = null;
  menuCb = null;
  localStorage.clear(); // sidebar/theme/session prefs persist; isolate tests
  clearRecents();
  // The store is a module singleton; reset it so tests do not leak state.
  useStore.setState(useStore.getInitialState());
});

afterEach(() => {
  autosave.cancel(); // a pending autosave must not fire into the next test
});

describe("App", () => {
  it("renders the empty state before a folder is opened", () => {
    render(<App />);
    expect(screen.getByText(/open a note, or a folder/i)).toBeInTheDocument();
    // Two actions on the empty screen; no recent list until something was opened.
    expect(screen.getAllByRole("button", { name: /open folder/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /open file/i })).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: /recent/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open brain/i })).not.toBeInTheDocument();
  });

  it("renders without crashing when the Tauri runtime is unavailable", async () => {
    // listen() is async; without window.__TAURI_INTERNALS__ it REJECTS rather than
    // throwing synchronously. The effect's .catch must absorb it (no crash, no
    // unhandled rejection).
    vi.mocked(listen).mockRejectedValueOnce(
      new TypeError("window.__TAURI_INTERNALS__ is undefined"),
    );
    render(<App />);
    expect(screen.getByText(/open a note/i)).toBeInTheDocument();
    // Let the rejected listen() promise settle so its .catch runs.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/open a note/i)).toBeInTheDocument();
  });

  it("disables live-reload without crashing when listen throws synchronously", () => {
    vi.mocked(listen).mockImplementationOnce(() => {
      throw new TypeError("sync listen failure");
    });
    render(<App />);
    expect(screen.getByText(/open a note/i)).toBeInTheDocument();
  });

  it("opens a folder and shows files in the sidebar", async () => {
    vi.mocked(pickFolder).mockResolvedValue("/vault");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "docs/b.md"]);
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));

    expect(await screen.findByText("a.md")).toBeInTheDocument();
    // Once a folder is open, the header does not repeat the open actions.
    expect(screen.queryByRole("button", { name: /open folder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open file/i })).not.toBeInTheDocument();
  });

  it("creates a new file relative to the open folder via the sidebar +", async () => {
    vi.mocked(pickFolder).mockResolvedValue("/vault");
    vi.mocked(scanTree).mockResolvedValueOnce(["a.md"]).mockResolvedValueOnce(["a.md", "idea.md"]);
    vi.mocked(watchFolder).mockResolvedValue(undefined);
    vi.mocked(createPath).mockResolvedValue(undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(await screen.findByText("a.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new file or folder/i }));
    const input = screen.getByRole("textbox", { name: /new entry name/i });
    fireEvent.change(input, { target: { value: "idea" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Root-relative path, ".md" appended, and the new file opens in edit mode.
    await waitFor(() => {
      expect(createPath).toHaveBeenCalledWith("/vault/idea.md", false);
      expect(useStore.getState().activePath).toBe("idea.md");
    });
  });

  it("creates a directory when the name ends with a slash", async () => {
    vi.mocked(pickFolder).mockResolvedValue("/vault");
    vi.mocked(scanTree).mockResolvedValue(["a.md"]);
    vi.mocked(watchFolder).mockResolvedValue(undefined);
    vi.mocked(createPath).mockResolvedValue(undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(await screen.findByText("a.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new file or folder/i }));
    const input = screen.getByRole("textbox", { name: /new entry name/i });
    fireEvent.change(input, { target: { value: "topics/" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(createPath).toHaveBeenCalledWith("/vault/topics", true);
    });
    // A bare directory opens no note.
    expect(useStore.getState().activePath).toBeNull();
  });

  it("toggles the sidebar open and closed", async () => {
    vi.mocked(pickFolder).mockResolvedValue("/vault");
    vi.mocked(scanTree).mockResolvedValue(["a.md"]);
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(await screen.findByText("a.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /hide sidebar/i }));
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show sidebar/i }));
    expect(screen.getByText("a.md")).toBeInTheDocument();
  });

  it("autosaves silently on blur only when dirty, and stays on the note", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "hello");
    });

    render(<App />);
    expect(await screen.findByTestId("editor-stub")).toBeInTheDocument();

    // Clean: blur must not write.
    fireEvent.click(screen.getByRole("button", { name: "blur" }));
    await Promise.resolve();
    expect(writeFile).not.toHaveBeenCalled();

    // Dirty: blur saves silently and the note stays open.
    act(() => useStore.getState().setContent("changed"));
    fireEvent.click(screen.getByRole("button", { name: "blur" }));
    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
    expect(useStore.getState().dirty).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("opens a file delivered by the OS on launch (default-app association)", async () => {
    // Simulate a file-association / `open file.md` launch: the path was buffered
    // by Rust before the webview mounted and is drained via takePendingOpen.
    vi.mocked(takePendingOpen).mockResolvedValueOnce(["/a/b/readme.md"]);
    vi.mocked(readFile).mockResolvedValueOnce("# Readme\n\nbody");
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);

    await waitFor(() => {
      const s = useStore.getState();
      expect(s.root).toBe("/a/b");
      expect(s.activePath).toBe("readme.md");
      expect(s.files).toEqual(["readme.md"]);
    });
    expect(readFile).toHaveBeenCalledWith("/a/b/readme.md");
    expect(watchFolder).toHaveBeenCalledWith("/a/b");
  });

  it("opens a file from a runtime open-files event (already running)", async () => {
    vi.mocked(readFile).mockResolvedValueOnce("# Live\n\nbody");
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);
    // The effect registers the "open-files" listener; let it resolve.
    await waitFor(() => expect(openFilesCb).not.toBeNull());

    await act(async () => {
      openFilesCb?.({ payload: ["/x/y/live.md"] });
    });

    await waitFor(() => {
      const s = useStore.getState();
      expect(s.root).toBe("/x/y");
      expect(s.activePath).toBe("live.md");
    });
    expect(readFile).toHaveBeenCalledWith("/x/y/live.md");
    expect(watchFolder).toHaveBeenCalledWith("/x/y");
  });

  it("keeps earlier OS-opened files listed and switches between them", async () => {
    vi.mocked(readFile).mockImplementation((p: string) => Promise.resolve(`body of ${p}`));
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);
    await waitFor(() => expect(openFilesCb).not.toBeNull());
    await act(async () => {
      openFilesCb?.({ payload: ["/x/one.md"] });
    });
    await act(async () => {
      openFilesCb?.({ payload: ["/y/z/two.md"] });
    });

    await waitFor(() => expect(useStore.getState().activePath).toBe("two.md"));
    expect(useStore.getState().openFiles).toEqual(["/x/one.md", "/y/z/two.md"]);
    expect(screen.getByRole("button", { name: "one.md" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "one.md" }));
    await waitFor(() => {
      const s = useStore.getState();
      expect(s.root).toBe("/x");
      expect(s.activePath).toBe("one.md");
      expect(s.content).toBe("body of /x/one.md");
    });
    expect(useStore.getState().openFiles).toEqual(["/x/one.md", "/y/z/two.md"]);

    // Closing a file drops it from the list and opens its neighbour.
    await act(async () => {
      await registry.runCommand("file.close");
    });
    await waitFor(() => expect(useStore.getState().activePath).toBe("two.md"));
    expect(useStore.getState().openFiles).toEqual(["/y/z/two.md"]);
  });

  it("keeps the note open when save fails", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));

    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
    });

    render(<App />);
    expect(await screen.findByTestId("editor-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
    expect(useStore.getState().dirty).toBe(true);
  });

  it("warns and offers keep/reload when the active file changes on disk while dirty", async () => {
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "orig");
      useStore.getState().setContent("edited"); // dirty = true
    });

    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));

    vi.mocked(readFile).mockResolvedValue("theirs");
    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/a.md"] });
    });
    // The lazy toast facade fires sonner via a dynamic import; wait for it.
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());

    const [msg, opts] = (toast.warning as Mock).mock.calls.at(-1) as [
      string,
      { action: { label: string; onClick: () => void }; cancel: { label: string } },
    ];
    expect(msg).toBe("This file changed on disk.");
    expect(opts.action.label).toBe("Reload (discard mine)");
    expect(opts.cancel.label).toBe("Keep mine");

    // Dirty buffer must be preserved, not auto-reloaded.
    expect(useStore.getState().content).toBe("edited");

    // Clicking "Reload (discard mine)" must actually reload from disk.
    vi.mocked(readFile).mockResolvedValue("reloaded from disk");
    await act(async () => {
      opts.action.onClick();
      await Promise.resolve();
    });
    await waitFor(() => expect(useStore.getState().content).toBe("reloaded from disk"));
    expect(readFile).toHaveBeenCalledWith("/vault/a.md");
  });

  it("reloads automatically when the active file changes on disk and there are no unsaved edits", async () => {
    vi.mocked(readFile).mockResolvedValue("reloaded from disk");
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "orig"); // dirty = false
    });

    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));

    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/a.md"] });
    });

    expect(readFile).toHaveBeenCalledWith("/vault/a.md");
    expect(useStore.getState().content).toBe("reloaded from disk");
    expect(toast.warning).not.toHaveBeenCalled();

    // A change to a non-active file is ignored (no extra reload).
    vi.mocked(readFile).mockClear();
    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/other.md"] });
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(useStore.getState().content).toBe("reloaded from disk");
  });

  it("does not rescan the tree for a save's own temp file, but does for a new note", async () => {
    vi.mocked(readFile).mockResolvedValue("orig");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "b.md"]);
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "orig");
    });

    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));
    vi.mocked(scanTree).mockClear();

    // What an atomic save of a.md emits: the hidden temp, then the note itself.
    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/.tapa-tmp.42.1.0", "/vault/a.md"] });
    });
    expect(scanTree).not.toHaveBeenCalled();

    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/b.md"] });
    });
    await waitFor(() => expect(scanTree).toHaveBeenCalledWith("/vault"));
  });

  it("keeps a single-file note and its unsaved edits when a sibling file changes", async () => {
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], true);
      useStore.getState().setActive("a.md", "orig");
      useStore.getState().setContent("unsaved");
    });
    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));
    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/other.md"] });
    });
    expect(useStore.getState()).toMatchObject({
      single: true,
      activePath: "a.md",
      content: "unsaved",
      dirty: true,
    });
  });

  it("Cmd-S saves and stays on the note", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(useStore.getState().dirty).toBe(false));
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "hello edited");
  });

  it("save via Cmd-S keeps the note dirty when the write fails", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
    expect(useStore.getState().dirty).toBe(true);
  });

  it("file-watch matches the active file regardless of path separator (Windows)", async () => {
    vi.mocked(readFile).mockResolvedValue("win reload");
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "orig"); // dirty = false
    });

    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));

    // The native watcher payload uses backslashes; the listener must normalize.
    await act(async () => {
      await fileChangedCb?.({ payload: ["\\vault\\a.md"] });
    });

    expect(useStore.getState().content).toBe("win reload");
  });

  it("ignores Tapa's own save echoing back from the watcher, even mid-typing", async () => {
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "orig");
      useStore.getState().setContent("saved text");
      useStore.getState().markSaved("saved text");
      useStore.getState().setContent("saved text and more"); // typing after the write
    });
    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));

    vi.mocked(readFile).mockResolvedValue("saved text");
    await act(async () => {
      await fileChangedCb?.({ payload: ["/vault/a.md"] });
    });
    expect(toast.warning).not.toHaveBeenCalled();
    expect(useStore.getState().content).toBe("saved text and more");
  });

  it("File ▸ New File from the native menu asks where, writes a blank note and opens it", async () => {
    vi.mocked(pickSavePath).mockResolvedValueOnce("/notes/new.md");
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValueOnce("");
    render(<App />);
    await waitFor(() => expect(menuCb).toBeTypeOf("function"));

    await act(async () => {
      await menuCb?.({ payload: "file.new" });
    });
    await waitFor(() => expect(useStore.getState().activePath).toBe("new.md"));
    expect(writeFile).toHaveBeenCalledWith("/notes/new.md", "");
    expect(useStore.getState().root).toBe("/notes");
  });

  it("opens a recent item from the menu; a gone one leaves the recent list", async () => {
    act(() => {
      pushRecent("/gone.md");
      pushRecent("/vault");
    });
    vi.mocked(pathKind).mockResolvedValueOnce("missing");
    render(<App />);
    expect(screen.getByRole("button", { name: /gone\.md/ })).toBeInTheDocument();
    await waitFor(() => expect(menuCb).toBeTypeOf("function"));

    await act(async () => {
      await menuCb?.({ payload: "recent:/gone.md" });
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /gone\.md/ })).not.toBeInTheDocument();

    // The welcome list opens a recent folder on click.
    vi.mocked(pathKind).mockResolvedValueOnce("dir");
    vi.mocked(scanTree).mockResolvedValueOnce(["a.md"]);
    fireEvent.click(screen.getByRole("button", { name: /vault/ }));
    expect(await screen.findByText("a.md")).toBeInTheDocument();
  });

  it("reopens the last folder and note on launch, and skips a missing one quietly", async () => {
    localStorage.setItem(
      "tapa-session",
      JSON.stringify({ root: "/vault", single: false, note: "b.md" }),
    );
    vi.mocked(scanTree).mockResolvedValueOnce(["a.md", "b.md"]);
    vi.mocked(readFile).mockResolvedValueOnce("bee");
    const { unmount } = render(<App />);
    await waitFor(() => expect(useStore.getState().activePath).toBe("b.md"));
    expect(useStore.getState()).toMatchObject({ root: "/vault", content: "bee" });
    unmount();

    useStore.setState(useStore.getInitialState());
    vi.mocked(scanTree).mockRejectedValueOnce("No such folder");
    render(<App />);
    await waitFor(() => expect(scanTree).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(useStore.getState().root).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("Close Note saves first and keeps the folder open", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"], false);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
    });
    render(<App />);
    await act(async () => {
      await registry.runCommand("file.close");
    });
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "hello edited");
    expect(useStore.getState()).toMatchObject({ activePath: null, root: "/vault" });
  });
});
