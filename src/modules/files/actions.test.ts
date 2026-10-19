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
  writeFile,
} from "@/lib/tauri";
import { useStore } from "@/state/store";
import {
  AUTOSAVE_MS,
  autosave,
  installAutosave,
  openNote,
  renameNote,
  save,
  saveAs,
} from "./actions";
import { guardWindowClose } from "./desktop";

function openA(content = "hello") {
  useStore.getState().setFolder("/vault", ["a.md", "b.md"]);
  useStore.getState().setActive("a.md", content);
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
});

describe("save as", () => {
  it("writes the copy, opens it, and leaves the old file as it was", async () => {
    openA();
    useStore.getState().setContent("edited");
    vi.mocked(pickSavePath).mockResolvedValue("/vault/copy.md");
    vi.mocked(scanTree).mockResolvedValue(["a.md", "b.md", "copy.md"]);
    vi.mocked(readFile).mockResolvedValue("edited");
    await saveAs();
    expect(pickSavePath).toHaveBeenCalledWith("/vault/a.md");
    expect(vi.mocked(writeFile).mock.calls).toEqual([["/vault/copy.md", "edited"]]);
    expect(useStore.getState()).toMatchObject({ activePath: "copy.md", dirty: false });
  });
});
