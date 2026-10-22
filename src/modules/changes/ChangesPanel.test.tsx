import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviousVersion } from "@/lib/tauri";
import { useStore } from "@/state/store";
import type { Change } from "./diff";

const previousVersion = vi.fn<(path: string) => Promise<PreviousVersion | null>>();
const sentenceChanges = vi.fn<(before: string, after: string) => Change[]>();

vi.mock("@/lib/tauri", () => ({ previousVersion: (p: string) => previousVersion(p) }));
vi.mock("./diff", () => ({ sentenceChanges: (a: string, b: string) => sentenceChanges(a, b) }));

import { ChangesPanel, REFRESH_MS } from "./ChangesPanel";

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REFRESH_MS + 10);
  });
}

function openNote(content: string): void {
  useStore.setState({ root: "/notes", activePath: "river.md", content });
}

describe("ChangesPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    previousVersion.mockReset();
    sentenceChanges.mockReset();
    openNote("O rio é longo. A noite chegou.");
  });

  it("lists added and removed sentences as plain text under the Git label", async () => {
    previousVersion.mockResolvedValue({ source: "git", text: "O rio é longo. O dia acabou." });
    sentenceChanges.mockReturnValue([
      { kind: "removed", text: "O dia acabou." },
      { kind: "added", text: "A noite chegou." },
    ]);
    render(<ChangesPanel onClose={() => {}} />);
    await settle();

    expect(previousVersion).toHaveBeenCalledWith("/notes/river.md");
    expect(screen.getByText("Since the last commit")).toBeInTheDocument();
    expect(screen.getByText(/^Added/)).toBeInTheDocument();
    expect(screen.getByText(/^Removed/)).toBeInTheDocument();
    expect(screen.getByText("A noite chegou.")).toBeInTheDocument();
    expect(screen.getByText("O dia acabou.")).toBeInTheDocument();
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.textContent).not.toMatch(/^[+-]/);
    }
  });

  it("compares the previous text with the unsaved editor text", async () => {
    previousVersion.mockResolvedValue({ source: "git", text: "before" });
    sentenceChanges.mockReturnValue([]);
    render(<ChangesPanel onClose={() => {}} />);
    await settle();
    expect(sentenceChanges).toHaveBeenLastCalledWith("before", "O rio é longo. A noite chegou.");
  });

  it("labels the copy Tapa kept when the note was opened", async () => {
    previousVersion.mockResolvedValue({ source: "saved", text: "x" });
    sentenceChanges.mockReturnValue([{ kind: "added", text: "Nova frase." }]);
    render(<ChangesPanel onClose={() => {}} />);
    await settle();
    expect(screen.getByText("Since you opened this note")).toBeInTheDocument();
  });

  it("says Nothing changed when the sentences match", async () => {
    previousVersion.mockResolvedValue({ source: "git", text: "same" });
    sentenceChanges.mockReturnValue([]);
    render(<ChangesPanel onClose={() => {}} />);
    await settle();
    expect(screen.getByText("Nothing changed.")).toBeInTheDocument();
  });

  it("explains when there is no earlier version", async () => {
    previousVersion.mockResolvedValue(null);
    render(<ChangesPanel onClose={() => {}} />);
    await settle();
    expect(screen.getByText(/no earlier version/i)).toBeInTheDocument();
    expect(sentenceChanges).not.toHaveBeenCalled();
  });

  it("recomputes after typing pauses", async () => {
    previousVersion.mockResolvedValue({ source: "git", text: "base" });
    sentenceChanges.mockReturnValue([]);
    render(<ChangesPanel onClose={() => {}} />);
    await settle();
    sentenceChanges.mockClear();

    act(() => useStore.setState({ content: "base. Mais uma." }));
    await settle();
    expect(sentenceChanges).toHaveBeenLastCalledWith("base", "base. Mais uma.");
  });

  it("closes from the button and from Escape", async () => {
    previousVersion.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<ChangesPanel onClose={onClose} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
