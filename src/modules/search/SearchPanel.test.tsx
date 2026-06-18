import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchPanel } from "@/modules/search/SearchPanel";
import type { SearchHit } from "@/lib/tauri";

// jsdom lacks ResizeObserver, which cmdk uses internally.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const hits: SearchHit[] = [
  { path: "a.md", line: 3, col: 0, snippet: "needle one" },
  { path: "a.md", line: 7, col: 2, snippet: "a needle two" },
  { path: "b.md", line: 1, col: 0, snippet: "needle three" },
];

describe("SearchPanel", () => {
  it("renders streamed hits grouped by file with a count summary", () => {
    render(<SearchPanel open hits={hits} query="needle" onPick={() => {}} onClose={() => {}} />);
    const headings = Array.from(document.querySelectorAll("[cmdk-group-heading]")).map(
      (h) => h.textContent ?? "",
    );
    expect(headings).toHaveLength(2); // grouped by file: a.md, b.md
    expect(headings.some((h) => h.includes("a.md"))).toBe(true);
    expect(headings.some((h) => h.includes("b.md"))).toBe(true);
    expect(screen.getByText(/3 matches in 2 files/i)).toBeInTheDocument();
  });

  it("invokes onPick with the hit when a result is selected", () => {
    const onPick = vi.fn();
    render(<SearchPanel open hits={hits} query="needle" onPick={onPick} onClose={() => {}} />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    fireEvent.click(options[2]);
    expect(onPick).toHaveBeenCalledWith(hits[2]);
  });
});
