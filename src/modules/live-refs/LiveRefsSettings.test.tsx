import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveRefKind, LiveRefsConfig } from "@/lib/tauri";

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
  // Reset implementations too, so one test's answers never leak into the next.
  vi.resetAllMocks();
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
    expect(screen.getByText("Ran: bora-pane")).toBeTruthy();
    expect(screen.queryByText(/ran instead of this one/)).toBeNull();

    fireEvent.input(screen.getByLabelText("Every (seconds)"), { target: { value: "9" } });
    expect((screen.getByText("Test") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save first/)).toBeTruthy();
  });

  it("says when Test ran another saved command whose pattern comes first", async () => {
    tauri.liveRefsRun.mockResolvedValue({
      status: "ok",
      name: "other-pane",
      state: "idle",
      detail: "",
      exitCode: 0,
      ms: 3,
    });
    await mount([bora]);
    fireEvent.input(screen.getByLabelText("Sample reference text"), {
      target: { value: "w1BA:p1" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Test"));
    });
    expect(screen.getByText("Ran: other-pane")).toBeTruthy();
    expect(screen.getByText(/other-pane, which comes first/)).toBeTruthy();
  });

  it("never saves over commands it could not read, until a retry reads them", async () => {
    tauri.liveRefsConfig.mockRejectedValueOnce("permission denied");
    render(<LiveRefsSettings />);
    await act(async () => {});
    expect(screen.getByText(/permission denied/)).toBeTruthy();
    for (const label of ["Save", "Add command", "Add bora pane"]) {
      expect((screen.getByText(label) as HTMLButtonElement).disabled, label).toBe(true);
    }
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(tauri.liveRefsSave).not.toHaveBeenCalled();

    tauri.liveRefsConfig.mockResolvedValueOnce({ version: 1, kinds: [bora] });
    await act(async () => {
      fireEvent.click(screen.getByText("Retry"));
    });
    expect(screen.queryByText(/permission denied/)).toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("bora-pane");
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("checks the timing fields on the row before saving", async () => {
    await mount([bora]);
    fireEvent.input(screen.getByLabelText("Every (seconds)"), { target: { value: "1.5" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(tauri.liveRefsSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Every: use a whole number/).closest("fieldset")).toBeTruthy();

    fireEvent.input(screen.getByLabelText("Every (seconds)"), { target: { value: "5" } });
    fireEvent.input(screen.getByLabelText("Give up after (ms)"), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(tauri.liveRefsSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Give up after: use a whole number/)).toBeTruthy();
  });

  it("locks the form while a save is pending", async () => {
    let finish: (c: LiveRefsConfig) => void = () => {};
    tauri.liveRefsSave.mockReturnValue(new Promise((r) => (finish = r)));
    await mount([bora]);
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    const program = () => screen.getByLabelText("Command (full path)") as HTMLInputElement;
    expect(program().disabled).toBe(true);
    for (const label of ["Find", "Remove", "Add command", "Add bora pane", "Saving…"]) {
      expect((screen.getByText(label) as HTMLButtonElement).disabled, label).toBe(true);
    }
    await act(async () => finish({ version: 1, kinds: [bora] }));
    expect(program().disabled).toBe(false);
  });

  it("finds a Windows program by its file name", async () => {
    await mount([{ ...bora, program: "C:\\Tools\\bora.exe" }]);
    await act(async () => {
      fireEvent.click(screen.getByText("Find"));
    });
    expect(tauri.liveRefsFindProgram).toHaveBeenCalledWith("bora.exe");
  });
});
