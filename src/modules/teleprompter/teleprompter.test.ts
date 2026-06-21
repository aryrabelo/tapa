import { afterEach, describe, expect, it, vi } from "vitest";
import { createRegistry, type ReaderContext } from "@/lib/registry";

// The overlay controller pulls in tauri APIs; mock it whole so the module
// wiring can be tested in jsdom without a real webview.
const { toggleOverlay } = vi.hoisted(() => ({
  toggleOverlay: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/modules/teleprompter/overlay", () => ({ toggleOverlay }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(() => Promise.resolve()),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: vi.fn(() => Promise.resolve(null)) },
  getCurrentWebviewWindow: vi.fn(),
}));

import { teleprompterModule } from "@/modules/teleprompter";

const rc = (path: string | null): ReaderContext => ({
  element: document.body,
  sourceOffset: null,
  line: null,
  selection: "",
  path,
});

describe("teleprompter module", () => {
  afterEach(() => {
    toggleOverlay.mockClear();
  });

  it("registers the ⌘⇧T toggle command that runs the overlay", async () => {
    const reg = createRegistry();
    reg.register(teleprompterModule);

    const cmd = reg.commands().find((c) => c.id === "teleprompter.toggle");
    expect(cmd?.title).toBe("Teleprompter: scroll the document");
    expect(cmd?.keybinding).toBe("mod+shift+t");

    await reg.runCommand("teleprompter.toggle");
    expect(toggleOverlay).toHaveBeenCalledTimes(1);
  });

  it("contributes a context-menu item that runs the overlay when a file is open", async () => {
    const reg = createRegistry();
    reg.register(teleprompterModule);
    await reg.activate("teleprompter");

    const item = reg.contextMenuItems(rc("a.md")).find((i) => i.id === "teleprompter.toggle");
    expect(item?.label).toBe("Start teleprompter");
    expect(item?.group).toBe("Tools");

    item?.run(rc("a.md"));
    expect(toggleOverlay).toHaveBeenCalledTimes(1);
  });

  it("hides the context-menu item when no file is open", async () => {
    const reg = createRegistry();
    reg.register(teleprompterModule);
    await reg.activate("teleprompter");

    const items = reg.contextMenuItems(rc(null));
    expect(items.find((i) => i.id === "teleprompter.toggle")).toBeUndefined();
  });
});
