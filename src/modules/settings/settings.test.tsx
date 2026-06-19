import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom lacks these; cmdk/Radix and the Reader scroll effect touch them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/components/editor/Editor", () => ({ Editor: () => null }));
vi.mock("@/lib/tauri", () => ({
  scanTree: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn(() => Promise.resolve("")),
  writeFile: vi.fn(),
  watchFolder: vi.fn(() => Promise.resolve()),
  takePendingOpen: vi.fn(() => Promise.resolve([])),
  pickFolder: vi.fn(() => Promise.resolve(null)),
  pickFile: vi.fn(() => Promise.resolve(null)),
  searchContent: vi.fn(),
}));

import { registry } from "@/lib/registry";
import { useStore } from "@/state/store";
import App from "@/App";

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    root: "/vault",
    files: [],
    tree: [],
    activePath: null,
    content: "",
    mode: "reader",
    dirty: false,
    editOffset: null,
    scrollLine: null,
  });
});

afterEach(async () => {
  await act(async () => {
    await registry.runCommand("settings.close");
  });
});

describe("App settings (⌘,)", () => {
  it("opens the settings modal listing theme and shortcuts", async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ",", metaKey: true });

    // The modal title and a representative shortcut row prove it rendered.
    expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Jump to file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
  });

  it("closes on the settings.close command", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    await screen.findByText("Keyboard shortcuts");

    await act(async () => {
      await registry.runCommand("settings.close");
    });

    expect(screen.queryByText("Keyboard shortcuts")).not.toBeInTheDocument();
  });
});
