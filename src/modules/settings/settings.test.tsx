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
import { bootCorePlugins, isPluginEnabled } from "@/lib/plugins";
import { getPluginConfigValue } from "@/lib/plugin-config";
import { useStore } from "@/state/store";
import App from "@/App";

beforeEach(async () => {
  vi.clearAllMocks();
  await bootCorePlugins();
  useStore.setState({
    root: "/vault",
    files: [],
    tree: [],
    activePath: null,
    content: "",
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

  it("shows a plugin's toggle fields as switches that save true/false", async () => {
    localStorage.setItem("tapa-plugin-overrides", JSON.stringify({ focus: true }));
    render(<App />);
    fireEvent.keyDown(window, { key: ",", metaKey: true });

    const centred = await screen.findByRole("switch", { name: "Keep the line centred" });
    expect(centred).toHaveAttribute("aria-checked", "true"); // unset reads as on
    fireEvent.click(centred);
    expect(getPluginConfigValue("focus", "typewriter")).toBe("false");
    expect(centred).toHaveAttribute("aria-checked", "false");
    localStorage.clear();
  });

  it("follows ⌘⇧D while open, so the next click does not undo it", async () => {
    localStorage.clear();
    render(<App />);
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(await screen.findByRole("switch", { name: "Enable Focus" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "D", metaKey: true, shiftKey: true });
    const sw = await screen.findByRole("switch", { name: "Disable Focus" });
    expect(sw).toHaveAttribute("aria-checked", "true");

    fireEvent.click(sw);
    await screen.findByRole("switch", { name: "Enable Focus" });
    expect(isPluginEnabled("focus")).toBe(false);
    localStorage.clear();
  });
});
