import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveRefKind } from "@/lib/tauri";

const tauri = vi.hoisted(() => ({
  liveRefsConfig: vi.fn(),
  liveRefsSave: vi.fn(),
  liveRefsRun: vi.fn(),
  liveRefsFindProgram: vi.fn(),
}));
vi.mock("@/lib/tauri", () => tauri);

import LiveRefsSettings, { argvPreview, BORA_MATCH, toDraft, toKind } from "./LiveRefsSettings";

const bora: LiveRefKind = {
  name: "bora-pane",
  match: BORA_MATCH,
  program: "/Users/me/.local/bin/bora",
  args: ["pane", "get", "{1}"],
  intervalSec: 5,
  timeoutMs: 2000,
  parse: { json: { status: "/result/pane/agent_status", error: "/error/message" } },
  enabled: true,
};

async function mount(kinds: LiveRefKind[] = []) {
  tauri.liveRefsConfig.mockResolvedValue({ version: 1, kinds });
  render(<LiveRefsSettings />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  tauri.liveRefsFindProgram.mockResolvedValue("/Users/me/.local/bin/bora");
});

describe("draft round trip", () => {
  it("turns a saved kind into form fields and back unchanged", () => {
    expect(toKind(toDraft(bora))).toEqual(bora);
  });

  it("shows the exact argv, quoting arguments with spaces", () => {
    expect(
      argvPreview({ ...bora, program: "/bin/sh", args: ["-c", 'printf %s "$1"', "_", "{1}"] }),
    ).toBe('/bin/sh -c "printf %s \\"$1\\"" _ {1}');
  });
});

describe("Live references settings", () => {
  it("adds the bora preset with the program found on this machine", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByText("Add bora pane"));
    });
    expect(tauri.liveRefsFindProgram).toHaveBeenCalledWith("bora");
    expect(await screen.findByText("/Users/me/.local/bin/bora pane get {1}")).toBeTruthy();
    expect((screen.getByLabelText(/Reference pattern/) as HTMLInputElement).value).toBe(BORA_MATCH);
  });

  it("keeps edits and stays calm when the save is not approved", async () => {
    tauri.liveRefsSave.mockRejectedValue("not approved");
    await mount([bora]);
    fireEvent.input(screen.getByLabelText("Command (full path)"), {
      target: { value: "/opt/other" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    const notice = screen.getByText(/you chose Cancel/);
    expect(notice.className).not.toContain("destructive");
    expect((screen.getByLabelText("Command (full path)") as HTMLInputElement).value).toBe(
      "/opt/other",
    );
  });

  it("shows other save errors next to the kind they name", async () => {
    tauri.liveRefsSave.mockRejectedValue("bora-pane: program must be an absolute path (use Find)");
    await mount([bora]);
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    const err = screen.getByText(/program must be an absolute path/);
    expect(err.className).toContain("destructive");
    expect(err.closest("fieldset")).toBeTruthy();
  });

  it("tests only saved commands", async () => {
    tauri.liveRefsRun.mockResolvedValue({
      status: "ok",
      name: "bora-pane",
      state: "done",
      detail: "Layout",
      exitCode: 0,
      ms: 3,
    });
    await mount([bora]);
    const sample = screen.getByLabelText("Sample reference text");
    fireEvent.input(sample, { target: { value: "herdr-openrig w1BA:p1" } });
    const test = screen.getByText("Test") as HTMLButtonElement;
    expect(test.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(test);
    });
    expect(tauri.liveRefsRun).toHaveBeenCalledWith("herdr-openrig w1BA:p1");
    expect(screen.getByText("done")).toBeTruthy();

    fireEvent.input(screen.getByLabelText("Every (seconds)"), { target: { value: "9" } });
    expect((screen.getByText("Test") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save first/)).toBeTruthy();
  });
});
