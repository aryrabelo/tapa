import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CloseHandler = (e: { preventDefault: () => void }) => Promise<void>;
let closeHandler: CloseHandler | null = null;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (h: CloseHandler) => {
      closeHandler = h;
      return Promise.resolve(() => {});
    },
    setTitle: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }),
}));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/tauri", () => ({
  confirmAction: vi.fn(),
  pathKind: vi.fn(),
  pickFile: vi.fn(),
  pickFolder: vi.fn(),
  pickSavePath: vi.fn(),
  readFile: vi.fn(),
  rememberVersion: vi.fn(() => Promise.resolve()),
  renamePath: vi.fn(),
  revealPath: vi.fn(),
  scanTree: vi.fn(),
  setRecentMenu: vi.fn(() => Promise.resolve()),
  trashPath: vi.fn(),
  watchFolder: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(),
}));

import {
  confirmAction,
  pickSavePath,
  readFile,
  renamePath,
  scanTree,
  trashPath,
  writeFile,
} from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { useStore } from "@/state/store";
import {
  AUTOSAVE_MS,
  autosave,
  closeNote,
  installAutosave,
  openFile,
  openFolder,
  openNote,
  rememberSession,
  renameNote,
  restoreSession,
  save,
  saveAs,
  trashNote,
} from "./actions";
import { guardWindowClose } from "./desktop";

function openA(content = "hello") {
  useStore.getState().setFolder("/vault", ["a.md", "b.md"], false);
  useStore.getState().setActive("a.md", content);
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState(useStore.getInitialState());
  vi.mocked(writeFile).mockResolvedValue(undefined);
});

afterEach(() => {
  autosave.cancel();
  vi.useRealTimers();
});

describe("autosave", () => {
  it("writes once, a short pause after the last keystroke", async () => {
    vi.useFakeTimers();
    openA();
    const off = installAutosave();
    useStore.getState().setContent("h");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 300);
    useStore.getState().setContent("hi");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    expect(writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "hi");
    expect(useStore.getState().dirty).toBe(false);
    off();
  });

  it("keeps the note dirty when typing continues during the write", async () => {
    openA();
    let finish: () => void = () => {};
    vi.mocked(writeFile).mockReturnValue(new Promise<void>((r) => (finish = r)));
    useStore.getState().setContent("first");
    const saving = save();
    await vi.waitFor(() => expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "first"));
    useStore.getState().setContent("first and more");
    finish();
    await saving;
    expect(useStore.getState().dirty).toBe(true);
    expect(useStore.getState().savedContent).toBe("first");
  });

  it("flushes pending edits before switching notes", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(readFile).mockResolvedValue("bee");
    await openNote("b.md");
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "edited");
    expect(vi.mocked(writeFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(readFile).mock.invocationCallOrder[0],
    );
    expect(useStore.getState()).toMatchObject({ activePath: "b.md", content: "bee" });
  });

  it("stays on the note when that save fails, so nothing is lost", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));
    await openNote("b.md");
    expect(readFile).not.toHaveBeenCalled();
    expect(useStore.getState()).toMatchObject({ activePath: "a.md", content: "edited" });
  });

  it("saves what was typed while the next note was loading", async () => {
    openA();
    useStore.getState().setContent("edited");
    const read = deferred<string>();
    vi.mocked(readFile).mockReturnValue(read.promise);
    const switching = openNote("b.md");
    await vi.waitFor(() => expect(readFile).toHaveBeenCalled());
    useStore.getState().setContent("edited, then more");
    read.resolve("bee");
    await switching;
    expect(writeFile).toHaveBeenLastCalledWith("/vault/a.md", "edited, then more");
    expect(useStore.getState()).toMatchObject({ activePath: "b.md", content: "bee" });
  });

  it("saves what was typed during the save before closing the note", async () => {
    openA();
    useStore.getState().setContent("first");
    const write = deferred<void>();
    vi.mocked(writeFile).mockReturnValueOnce(write.promise);
    const closing = closeNote();
    await vi.waitFor(() => expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "first"));
    useStore.getState().setContent("first and more");
    write.resolve();
    await closing;
    expect(writeFile).toHaveBeenLastCalledWith("/vault/a.md", "first and more");
    expect(useStore.getState().activePath).toBeNull();
  });

  it("saves before the window closes; a failed save keeps it open unless the user agrees", async () => {
    const off = guardWindowClose();
    await vi.waitFor(() => expect(closeHandler).not.toBeNull());
    openA();
    useStore.getState().setContent("edited");
    const ok = { preventDefault: vi.fn() };
    await closeHandler?.(ok);
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "edited");
    expect(ok.preventDefault).not.toHaveBeenCalled();

    useStore.getState().setContent("edited again");
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));
    vi.mocked(confirmAction).mockResolvedValue(false);
    const failed = { preventDefault: vi.fn() };
    await closeHandler?.(failed);
    expect(failed.preventDefault).toHaveBeenCalled();
    off();
  });
});

describe("rename", () => {
  it("refuses a name that already exists and keeps the note where it was", async () => {
    openA();
    vi.mocked(renamePath).mockRejectedValue("A file named b.md already exists.");
    expect(await renameNote("b")).toBe("A file named b.md already exists.");
    expect(renamePath).toHaveBeenCalledWith("/vault/a.md", "/vault/b.md");
    expect(useStore.getState().activePath).toBe("a.md");
    expect(scanTree).not.toHaveBeenCalled();
  });

  it("keeps the extension and the open editor when renaming", async () => {
    openA();
    const key = useStore.getState().noteKey;
    vi.mocked(renamePath).mockResolvedValue(undefined);
    vi.mocked(scanTree).mockResolvedValue(["idea.md", "b.md"]);
    expect(await renameNote(" idea ")).toBeNull();
    expect(renamePath).toHaveBeenCalledWith("/vault/a.md", "/vault/idea.md");
    expect(useStore.getState()).toMatchObject({ activePath: "idea.md", noteKey: key });
    expect(await renameNote("x/y")).toMatch(/can't contain/);
  });

  it("adds .md to a name with a dot that is not a Markdown extension", async () => {
    openA();
    vi.mocked(renamePath).mockResolvedValue(undefined);
    vi.mocked(scanTree).mockResolvedValue(["Meeting 3.5.md", "b.md"]);
    expect(await renameNote("Meeting 3.5")).toBeNull();
    expect(renamePath).toHaveBeenCalledWith("/vault/a.md", "/vault/Meeting 3.5.md");
    expect(useStore.getState().activePath).toBe("Meeting 3.5.md");
  });
});

describe("trash", () => {
  it("saves the latest edits before moving the note to the Trash", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(confirmAction).mockResolvedValue(true);
    vi.mocked(trashPath).mockResolvedValue(undefined);
    vi.mocked(scanTree).mockResolvedValue(["b.md"]);
    await trashNote();
    expect(writeFile).toHaveBeenCalledWith("/vault/a.md", "edited");
    expect(vi.mocked(writeFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(trashPath).mock.invocationCallOrder[0],
    );
    expect(useStore.getState().activePath).toBeNull();
  });

  it("does not trash a note whose edits could not be saved", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(confirmAction).mockResolvedValue(true);
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));
    await trashNote();
    expect(trashPath).not.toHaveBeenCalled();
    expect(useStore.getState()).toMatchObject({ activePath: "a.md", content: "edited" });
  });
});

describe("save as", () => {
  it("writes the copy, opens it, and leaves the old file as it was", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(pickSavePath).mockResolvedValue("/vault/copy.md");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "b.md", "copy.md"]);
    await saveAs();
    expect(pickSavePath).toHaveBeenCalledWith("/vault/a.md");
    expect(vi.mocked(writeFile).mock.calls).toEqual([["/vault/copy.md", "edited"]]);
    expect(useStore.getState()).toMatchObject({ activePath: "copy.md", dirty: false });
  });

  it("keeps the note open with its edits when the copy cannot be written", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(pickSavePath).mockResolvedValue("/vault/copy.md");
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));
    await saveAs();
    expect(useStore.getState()).toMatchObject({
      activePath: "a.md",
      content: "edited",
      dirty: true,
    });
  });

  it("puts what was typed during the copy into the copy", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(pickSavePath).mockResolvedValue("/vault/copy.md");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "b.md", "copy.md"]);
    const write = deferred<void>();
    vi.mocked(writeFile).mockReturnValueOnce(write.promise);
    const saving = saveAs();
    await vi.waitFor(() => expect(writeFile).toHaveBeenCalledWith("/vault/copy.md", "edited"));
    useStore.getState().setContent("edited, then more");
    write.resolve();
    await saving;
    expect(vi.mocked(writeFile).mock.calls).toEqual([
      ["/vault/copy.md", "edited"],
      ["/vault/copy.md", "edited, then more"],
    ]);
    expect(useStore.getState()).toMatchObject({
      activePath: "copy.md",
      content: "edited, then more",
      dirty: false,
    });
  });
});

describe("open files (single-file mode)", () => {
  /** Files whose read fails, e.g. deleted or moved since they were listed. */
  let gone: Set<string>;

  beforeEach(() => {
    gone = new Set();
    localStorage.clear();
    vi.mocked(readFile).mockImplementation((p: string) =>
      gone.has(p) ? Promise.reject(`${p} is gone`) : Promise.resolve(`body of ${p}`),
    );
  });

  async function openAll(...files: string[]) {
    for (const f of files) expect(await openFile(f)).toBe(true);
  }

  it("re-opening a listed file keeps one entry in its place", async () => {
    await openAll("/x/one.md", "/y/two.md", "/z/three.md", "/x/one.md");
    expect(useStore.getState()).toMatchObject({
      root: "/x",
      activePath: "one.md",
      content: "body of /x/one.md",
      openFiles: ["/x/one.md", "/y/two.md", "/z/three.md"],
    });
  });

  it("closing the last open file goes back to the welcome screen", async () => {
    await openAll("/x/one.md");
    await closeNote();
    expect(useStore.getState()).toMatchObject({
      root: null,
      single: false,
      activePath: null,
      openFiles: [],
    });
  });

  it("closing a file opens its neighbour: the next one, or the previous at the end", async () => {
    await openAll("/x/one.md", "/y/two.md", "/z/three.md", "/y/two.md");
    await closeNote();
    expect(useStore.getState()).toMatchObject({
      root: "/z",
      activePath: "three.md",
      content: "body of /z/three.md",
      openFiles: ["/x/one.md", "/z/three.md"],
    });
    await closeNote();
    expect(useStore.getState()).toMatchObject({
      root: "/x",
      activePath: "one.md",
      content: "body of /x/one.md",
      openFiles: ["/x/one.md"],
    });
  });

  it("Move to Trash drops the file from the list and opens its neighbour", async () => {
    await openAll("/x/one.md", "/y/two.md", "/z/three.md", "/y/two.md");
    vi.mocked(confirmAction).mockResolvedValue(true);
    vi.mocked(trashPath).mockResolvedValue(undefined);
    await trashNote();
    expect(trashPath).toHaveBeenCalledWith("/y/two.md");
    expect(useStore.getState()).toMatchObject({
      root: "/z",
      activePath: "three.md",
      content: "body of /z/three.md",
      openFiles: ["/x/one.md", "/z/three.md"],
    });
  });

  it("renaming replaces the file in place and keeps the others", async () => {
    await openAll("/x/one.md", "/y/two.md", "/z/three.md", "/y/two.md");
    vi.mocked(renamePath).mockResolvedValue(undefined);
    expect(await renameNote("deux")).toBeNull();
    expect(renamePath).toHaveBeenCalledWith("/y/two.md", "/y/deux.md");
    expect(useStore.getState()).toMatchObject({
      root: "/y",
      single: true,
      activePath: "deux.md",
      openFiles: ["/x/one.md", "/y/deux.md", "/z/three.md"],
    });
  });

  it("a listed file that can't be read leaves the list; the open note stays", async () => {
    await openAll("/x/one.md", "/y/two.md");
    gone.add("/x/one.md");
    expect(await openFile("/x/one.md")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("/x/one.md is gone"));
    expect(useStore.getState()).toMatchObject({
      root: "/y",
      activePath: "two.md",
      content: "body of /y/two.md",
      openFiles: ["/y/two.md"],
    });
  });

  it("opening a folder clears the list; the next file starts a new one", async () => {
    await openAll("/x/one.md", "/y/two.md");
    vi.mocked(scanTree).mockResolvedValue(["a.md"]);
    expect(await openFolder("/vault")).toBe(true);
    expect(useStore.getState()).toMatchObject({ root: "/vault", single: false, openFiles: [] });
    await openAll("/z/three.md");
    expect(useStore.getState()).toMatchObject({
      root: "/z",
      single: true,
      activePath: "three.md",
      openFiles: ["/z/three.md"],
    });
  });

  it("a file inside the open folder opens as its note and stays off the list", async () => {
    useStore.getState().setFolder("/vault", ["a.md", "b.md"], false);
    useStore.getState().setActive("a.md", "aye");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "b.md"]);
    expect(await openFile("/vault/b.md")).toBe(true);
    expect(useStore.getState()).toMatchObject({
      root: "/vault",
      single: false,
      activePath: "b.md",
      content: "body of /vault/b.md",
      openFiles: [],
    });
  });

  it("remembers the list in the session and restores it in saved order", async () => {
    const off = rememberSession();
    await openAll("/x/one.md", "/y/two.md");
    off();
    expect(JSON.parse(localStorage.getItem("tapa-session") ?? "null")).toEqual({
      root: "/y",
      single: true,
      note: "two.md",
      files: ["/x/one.md", "/y/two.md"],
    });

    useStore.setState(useStore.getInitialState());
    localStorage.setItem(
      "tapa-session",
      JSON.stringify({
        root: "/y",
        single: true,
        note: "two.md",
        files: ["/z/three.md", "/y/two.md", "/x/one.md"],
      }),
    );
    await restoreSession();
    expect(useStore.getState()).toMatchObject({
      root: "/y",
      single: true,
      activePath: "two.md",
      content: "body of /y/two.md",
      openFiles: ["/z/three.md", "/y/two.md", "/x/one.md"],
    });
  });

  it("does not restore the list when the last note can't be read", async () => {
    gone.add("/y/two.md");
    localStorage.setItem(
      "tapa-session",
      JSON.stringify({
        root: "/y",
        single: true,
        note: "two.md",
        files: ["/x/one.md", "/y/two.md"],
      }),
    );
    await restoreSession();
    expect(toast.error).not.toHaveBeenCalled();
    expect(useStore.getState()).toMatchObject({ root: null, activePath: null, openFiles: [] });
  });
});
