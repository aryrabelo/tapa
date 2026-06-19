import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FindBar } from "@/modules/find/FindBar";

function renderBar(overrides: Partial<Parameters<typeof FindBar>[0]> = {}) {
  const props = {
    query: "fox",
    onQueryChange: vi.fn(),
    count: 3,
    current: 1,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<FindBar {...props} />);
  return props;
}

describe("FindBar", () => {
  it("renders the counter as current/total (1-based)", () => {
    renderBar({ count: 3, current: 1 });
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("shows 'No results' when a non-empty query matches nothing", () => {
    renderBar({ query: "zzz", count: 0 });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("triggers onNext on Enter", () => {
    const { onNext, onPrev } = renderBar();
    fireEvent.keyDown(screen.getByPlaceholderText("Find in file"), { key: "Enter" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("triggers onPrev on Shift+Enter", () => {
    const { onNext, onPrev } = renderBar();
    fireEvent.keyDown(screen.getByPlaceholderText("Find in file"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("triggers onClose on Escape", () => {
    const { onClose } = renderBar();
    fireEvent.keyDown(screen.getByPlaceholderText("Find in file"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports typing via onQueryChange", () => {
    const { onQueryChange } = renderBar({ query: "" });
    fireEvent.input(screen.getByPlaceholderText("Find in file"), { target: { value: "cat" } });
    expect(onQueryChange).toHaveBeenCalledWith("cat");
  });

  it("disables navigation buttons when there are no matches", () => {
    renderBar({ count: 0, query: "zzz" });
    expect(screen.getByLabelText("Next match")).toBeDisabled();
    expect(screen.getByLabelText("Previous match")).toBeDisabled();
  });
});
