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
  aiStatus: vi.fn(),
  aiSaveSettings: vi.fn(),
  aiSetKey: vi.fn(),
  aiClearKey: vi.fn(),
}));

import { registry } from "@/lib/registry";
import { bootCorePlugins, isPluginEnabled } from "@/lib/plugins";
import { getPluginConfigValue } from "@/lib/plugin-config";
import { type AiStatus, aiClearKey, aiSaveSettings, aiSetKey, aiStatus } from "@/lib/tauri";
import { useStore } from "@/state/store";
import App from "@/App";

const aiOff: AiStatus = {
  enabled: false,
  provider: "openai",
  model: "",
  hasKey: false,
  defaultModels: { openai: "gpt-6-luna", anthropic: "claude-haiku-5-5" },
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(aiStatus).mockResolvedValue(aiOff);
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

describe("AI suggestions in Settings", () => {
  const open = async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    return screen.findByRole("switch", { name: "AI suggestions" });
  };

  it("starts off and says plainly what would be sent", async () => {
    const sw = await open();
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/sends the text around\s+the caret/)).toHaveTextContent("OpenAI");
    expect(screen.getByText(/Nothing is sent while it is off/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("gpt-6-luna")).toBeInTheDocument();
  });

  it("switching it on saves through Rust", async () => {
    vi.mocked(aiSaveSettings).mockResolvedValue({ ...aiOff, enabled: true });
    fireEvent.click(await open());
    expect(aiSaveSettings).toHaveBeenCalledWith({ enabled: true, provider: "openai", model: "" });
    expect(await screen.findByRole("switch", { name: "AI suggestions" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("picking a provider resets the model to that provider's default", async () => {
    vi.mocked(aiSaveSettings).mockResolvedValue({ ...aiOff, provider: "anthropic" });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    expect(aiSaveSettings).toHaveBeenCalledWith({
      enabled: false,
      provider: "anthropic",
      model: "",
    });
    expect(await screen.findByPlaceholderText("claude-haiku-5-5")).toBeInTheDocument();
  });

  it("saves a key without ever showing it back, and removes it", async () => {
    vi.mocked(aiSetKey).mockResolvedValue({ ...aiOff, hasKey: true });
    vi.mocked(aiClearKey).mockResolvedValue(aiOff);
    await open();
    const field = screen.getByPlaceholderText("Paste your OpenAI key");
    expect(field).toHaveAttribute("type", "password");
    fireEvent.change(field, { target: { value: " sk-secret " } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    expect(aiSetKey).toHaveBeenCalledWith("sk-secret");
    expect(await screen.findByText("Key saved")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Paste your OpenAI key")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/sk-secret/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(aiClearKey).toHaveBeenCalledTimes(1);
    expect(await screen.findByPlaceholderText("Paste your OpenAI key")).toHaveValue("");
  });
});
