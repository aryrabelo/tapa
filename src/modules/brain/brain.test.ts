import { afterEach, describe, expect, it, vi } from "vitest";
import { createRegistry, type ReaderContext } from "@/lib/registry";

// The controller pulls in tauri APIs + the store; mock it whole so the module
// wiring can be tested in jsdom without a real backend.
const { openBrain, captureIdea } = vi.hoisted(() => ({
  openBrain: vi.fn(() => Promise.resolve()),
  captureIdea: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/modules/brain/brain", () => ({ openBrain, captureIdea }));

import { brainModule } from "@/modules/brain";

const rc = (path: string | null): ReaderContext => ({
  element: document.body,
  sourceOffset: null,
  line: null,
  selection: "",
  path,
});

describe("brain module", () => {
  afterEach(() => {
    openBrain.mockClear();
    captureIdea.mockClear();
  });

  it("registers the ⌘⇧B open command that opens the vault", async () => {
    const reg = createRegistry();
    reg.register(brainModule);

    const cmd = reg.commands().find((c) => c.id === "brain.open");
    expect(cmd?.title).toBe("Brain: open your ideas vault");
    expect(cmd?.keybinding).toBe("mod+shift+b");

    await reg.runCommand("brain.open");
    expect(openBrain).toHaveBeenCalledTimes(1);
  });

  it("registers the ⌘⇧I capture command that captures an idea", async () => {
    const reg = createRegistry();
    reg.register(brainModule);

    const cmd = reg.commands().find((c) => c.id === "brain.capture");
    expect(cmd?.title).toBe("Brain: capture an idea");
    expect(cmd?.keybinding).toBe("mod+shift+i");

    await reg.runCommand("brain.capture");
    expect(captureIdea).toHaveBeenCalledTimes(1);
  });

  it("contributes both context-menu items in the Tools group", async () => {
    const reg = createRegistry();
    reg.register(brainModule);
    await reg.activate("brain");

    const items = reg.contextMenuItems(rc(null));
    const open = items.find((i) => i.id === "brain.open");
    const capture = items.find((i) => i.id === "brain.capture");

    expect(open?.label).toBe("Open brain");
    expect(open?.group).toBe("Tools");
    expect(capture?.label).toBe("Capture idea");
    expect(capture?.group).toBe("Tools");

    open?.run(rc(null));
    expect(openBrain).toHaveBeenCalledTimes(1);
    capture?.run(rc(null));
    expect(captureIdea).toHaveBeenCalledTimes(1);
  });
});
