import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHit } from "@/lib/tauri";

// jsdom lacks these; cmdk/Radix and the Reader scroll effect touch them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

// Captures the streaming callback passed to searchContent so the test can feed hits.
let onHitCb: ((h: SearchHit) => void) | null = null;
const fixtures: SearchHit[] = [
  { path: "a.md", line: 3, col: 0, snippet: "needle one" },
  { path: "b.md", line: 5, col: 0, snippet: "needle two" },
];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/components/editor/Editor", () => ({ Editor: () => null }));
vi.mock("@/lib/tauri", () => ({
  scanTree: vi.fn(() => Promise.resolve(["a.md", "b.md"])),
  readFile: vi.fn(() => Promise.resolve("# a\n\nneedle one\n")),
  writeFile: vi.fn(),
  watchFolder: vi.fn(() => Promise.resolve()),
  takePendingOpen: vi.fn(() => Promise.resolve([])),
  pickFolder: vi.fn(() => Promise.resolve(null)),
  pickFile: vi.fn(() => Promise.resolve(null)),
  searchContent: vi.fn((_root, _q, _opts, onHit) => {
    onHitCb = onHit;
    return Promise.resolve();
  }),
}));

import { readFile, searchContent } from "@/lib/tauri";
import { registry } from "@/lib/registry";
import { useStore } from "@/state/store";
import App from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  onHitCb = null;
  // Seed an open folder so the search effect has a root.
  useStore.setState({
    root: "/vault",
    files: ["a.md", "b.md"],
    tree: [],
    activePath: null,
    content: "",
    mode: "reader",
    dirty: false,
    editOffset: null,
    scrollLine: null,
  });
});

afterEach(() => {
  act(() => {
    void registry.runCommand("search.close");
  });
});

describe("App content search (⌘⇧F)", () => {
  it("opens the overlay, streams grouped results, and jumps to the picked line", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "F", metaKey: true, shiftKey: true });
    const input = await screen.findByPlaceholderText("Search file contents…");

    fireEvent.change(input, { target: { value: "needle" } });
    await waitFor(() => expect(searchContent).toHaveBeenCalled());

    act(() => {
      for (const h of fixtures) onHitCb?.(h);
    });

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2); // grouped: one hit per file

    fireEvent.click(options[1]); // the b.md hit
    await waitFor(() => {
      expect(readFile).toHaveBeenCalledWith("/vault/b.md");
      expect(useStore.getState().scrollLine).toBe(5);
    });
  });

  it("leaves the ⌘K filename finder working", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByPlaceholderText("Jump to file...")).toBeInTheDocument();
  });
});
