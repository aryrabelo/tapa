import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Capture listener callbacks so tests can invoke them directly.
let fileChangedCb: ((ev: { payload: string[] }) => unknown) | null = null;
let openFilesCb: ((ev: { payload: string[] }) => unknown) | null = null;
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: (ev: { payload: string[] }) => unknown) => {
    if (event === "file-changed") fileChangedCb = cb;
    if (event === "open-files") openFilesCb = cb;
    return Promise.resolve(() => {});
  }),
}));
vi.mock("@/lib/tauri", () => ({
  scanTree: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  watchFolder: vi.fn(),
  takePendingOpen: vi.fn(() => Promise.resolve([])),
  pickFolder: vi.fn(() => Promise.resolve(null)),
  pickFile: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
// Stub the CodeMirror-backed Editor so jsdom never instantiates it; expose the
// exit/save handlers as plain buttons so the shell wiring can be driven.
vi.mock("@/components/editor/Editor", () => ({
  Editor: ({ onExit, onSave }: { onExit: () => void; onSave: () => void }) => (
    <div data-testid="editor-stub">
      <button type="button" onClick={onExit}>
        exit
      </button>
      <button type="button" onClick={onSave}>
        save
      </button>
    </div>
  ),
}));

import { listen } from "@tauri-apps/api/event";
import {
  pickFile,
  pickFolder,
  readFile,
  scanTree,
  takePendingOpen,
  watchFolder,
  writeFile,
} from "@/lib/tauri";
import { toast } from "sonner";
import App from "./App";
import { useStore } from "@/state/store";
import { registry } from "@/lib/registry";

beforeEach(() => {
  vi.clearAllMocks();
  fileChangedCb = null;
  openFilesCb = null;
  localStorage.clear(); // sidebar/theme prefs persist; isolate tests
  // The store is a module singleton; reset it so tests do not leak state.
  useStore.setState(
    useStore.getInitialState?.() ?? {
      root: null,
      files: [],
      tree: [],
      activePath: null,
      content: "",
      mode: "reader",
      dirty: false,
      editOffset: null,
    },
  );
});

describe("App", () => {
  it("renders the empty state before a folder is opened", () => {
    render(<App />);
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
    // Welcome owns the open actions exactly once; the header has none yet.
    expect(screen.getAllByRole("button", { name: /open folder/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /open file/i })).toHaveLength(1);
  });

  it("runs brain.open from the welcome screen's Open Brain button", () => {
    const run = vi.spyOn(registry, "runCommand").mockResolvedValue(undefined);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open brain/i }));
    expect(run).toHaveBeenCalledWith("brain.open");
  });

  it("renders without crashing when the Tauri runtime is unavailable", async () => {
    // listen() is async; without window.__TAURI_INTERNALS__ it REJECTS rather than
    // throwing synchronously. The effect's .catch must absorb it (no crash, no
    // unhandled rejection).
    vi.mocked(listen).mockRejectedValueOnce(
      new TypeError("window.__TAURI_INTERNALS__ is undefined"),
    );
    render(<App />);
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
    // Let the rejected listen() promise settle so its .catch runs.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
  });

  it("disables live-reload without crashing when listen throws synchronously", () => {
    vi.mocked(listen).mockImplementationOnce(() => {
      throw new TypeError("sync listen failure");
    });
    render(<App />);
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
  });

  it("opens a folder and shows files in the sidebar", async () => {
    vi.mocked(pickFolder).mockResolvedValue("/vault");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "docs/b.md"]);
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));

    expect(await screen.findByText("a.md")).toBeInTheDocument();
    // No duplicate open-actions: once a folder is open the header owns them once,
    // and the no-file hint in main carries none.
    expect(screen.getAllByRole("button", { name: /open folder/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /open file/i })).toHaveLength(1);
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

  it("opens a single markdown file scoped to its parent folder", async () => {
    vi.mocked(pickFile).mockResolvedValue("/a/b/note.md");
    vi.mocked(readFile).mockResolvedValue("# Note\n\nbody");
    vi.mocked(watchFolder).mockResolvedValue(undefined);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /open file/i }));

    await waitFor(() => {
      const s = useStore.getState();
      expect(s.root).toBe("/a/b");
      expect(s.activePath).toBe("note.md");
      expect(s.files).toEqual(["note.md"]);
    });
    // The single file appears in the sidebar (and the reader metadata header).
    expect(screen.getAllByText("note.md").length).toBeGreaterThan(0);
    // read with the absolute path, watch scoped to the parent
    expect(readFile).toHaveBeenCalledWith("/a/b/note.md");
    expect(watchFolder).toHaveBeenCalledWith("/a/b");
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

  it("keeps the editor open when save fails", async () => {
    // Save rejects -> save() returns false -> onExit must NOT exit edit mode.
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));

    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"]);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
      useStore.getState().enterEdit(0);
    });

    render(<App />);
    expect(await screen.findByTestId("editor-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "exit" }));

    await waitFor(() => {
      expect(useStore.getState().mode).toBe("edit");
    });
    expect(useStore.getState().dirty).toBe(true);
  });

  it("warns and offers keep/reload when the active file changes on disk while dirty", async () => {
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"]);
      useStore.getState().setActive("a.md", "orig");
      useStore.getState().setContent("edited"); // dirty = true
    });

    render(<App />);
    await waitFor(() => expect(fileChangedCb).toBeTypeOf("function"));

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
    expect(readFile).not.toHaveBeenCalled();

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
      useStore.getState().setFolder("/vault", ["a.md"]);
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

  it("Cmd-S (onSave) saves and returns to reader on success", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"]);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
      useStore.getState().enterEdit(0);
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(useStore.getState().mode).toBe("reader"));
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "hello edited");
  });

  it("save via Cmd-S keeps editor open on failure", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"]);
      useStore.getState().setActive("a.md", "hello");
      useStore.getState().setContent("hello edited");
      useStore.getState().enterEdit(0);
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(useStore.getState().mode).toBe("edit");
    });
    expect(useStore.getState().dirty).toBe(true);
  });

  it("file-watch matches the active file regardless of path separator (Windows)", async () => {
    vi.mocked(readFile).mockResolvedValue("win reload");
    act(() => {
      useStore.getState().setFolder("/vault", ["a.md"]);
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
});
