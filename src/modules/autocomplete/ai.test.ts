import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStatus } from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({ aiComplete: vi.fn(), aiStatus: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const status = (patch: Partial<AiStatus> = {}): AiStatus => ({
  enabled: true,
  provider: "openai",
  model: "",
  hasKey: true,
  defaultModels: { openai: "gpt-6-luna", anthropic: "claude-haiku-5-5" },
  ...patch,
});

// The module keeps per-session state (on/off, the one toast), so each test
// gets a fresh copy along with fresh mocks.
async function fresh() {
  vi.resetModules();
  const tauri = await import("@/lib/tauri");
  const { toast } = await import("@/lib/toast");
  const ai = await import("./ai");
  return {
    ai,
    toast,
    aiComplete: vi.mocked(tauri.aiComplete),
    aiStatus: vi.mocked(tauri.aiStatus),
  };
}

const signal = () => new AbortController().signal;

describe("aiSuggest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never calls Rust while AI is off, which is the default", async () => {
    const { ai, aiComplete } = await fresh();
    expect(await ai.aiSuggest("Hello", "", signal())).toBeNull();
    ai.setAiStatus(status({ enabled: false }));
    expect(await ai.aiSuggest("Hello", "", signal())).toBeNull();
    expect(aiComplete).not.toHaveBeenCalled();
  });

  it("never calls Rust when on but no key is saved", async () => {
    const { ai, aiComplete } = await fresh();
    ai.setAiStatus(status({ hasKey: false }));
    expect(await ai.aiSuggest("Hello", "", signal())).toBeNull();
    expect(aiComplete).not.toHaveBeenCalled();
  });

  it("asks Rust with the text around the caret when on with a key", async () => {
    const { ai, aiComplete } = await fresh();
    aiComplete.mockResolvedValue(" world.");
    ai.setAiStatus(status());
    expect(await ai.aiSuggest("Hello", "\nmore", signal())).toBe(" world.");
    expect(aiComplete).toHaveBeenCalledWith("Hello", "\nmore");
  });

  it("drops an answer that arrives after the request was aborted", async () => {
    const { ai, aiComplete } = await fresh();
    const ctrl = new AbortController();
    aiComplete.mockImplementation(async () => {
      ctrl.abort();
      return " late.";
    });
    ai.setAiStatus(status());
    expect(await ai.aiSuggest("Hello", "", ctrl.signal)).toBeNull();
  });

  it("loads the saved choice, and a failed load leaves AI off", async () => {
    const { ai, aiComplete, aiStatus } = await fresh();
    aiStatus.mockRejectedValue(new Error("no tauri"));
    await ai.loadAiStatus();
    await ai.aiSuggest("Hello", "", signal());
    expect(aiComplete).not.toHaveBeenCalled();

    aiStatus.mockResolvedValue(status());
    aiComplete.mockResolvedValue(null);
    await ai.loadAiStatus();
    await ai.aiSuggest("Hello", "", signal());
    expect(aiComplete).toHaveBeenCalledTimes(1);
  });

  it("shows one quiet toast per session, whatever fails after it", async () => {
    const { ai, aiComplete, toast } = await fresh();
    ai.setAiStatus(status());
    aiComplete.mockRejectedValue({ kind: "network" });
    await ai.aiSuggest("a", "", signal());
    await ai.aiSuggest("b", "", signal());
    aiComplete.mockRejectedValue({ kind: "timeout" });
    await ai.aiSuggest("c", "", signal());
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stops asking after the provider refuses the key", async () => {
    const { ai, aiComplete, toast } = await fresh();
    ai.setAiStatus(status());
    aiComplete.mockRejectedValue({ kind: "badKey" });
    expect(await ai.aiSuggest("a", "", signal())).toBeNull();
    await ai.aiSuggest("b", "", signal());
    expect(aiComplete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/key was not accepted/);
  });

  it("stays silent when Rust says AI is off or has no key", async () => {
    const { ai, aiComplete, toast } = await fresh();
    ai.setAiStatus(status());
    aiComplete.mockRejectedValue({ kind: "noKey" });
    await ai.aiSuggest("a", "", signal());
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
