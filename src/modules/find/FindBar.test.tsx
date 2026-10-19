import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EditorView } from "@codemirror/view";
import { attachEditorView } from "@/lib/editor-view";
import { FindBarView } from "@/modules/find/FindBar";
import type { FindController } from "@/modules/find/useFind";

function renderProps(overrides: Partial<FindController> = {}): FindController {
  return {
    query: "fox",
    setQuery: vi.fn(),
    caseSensitive: false,
    toggleCaseSensitive: vi.fn(),
    count: 3,
    current: 1,
    next: vi.fn(),
    prev: vi.fn(),
    close: vi.fn(),
    replaceOpen: false,
    toggleReplace: vi.fn(),
    replacement: "",
    setReplacement: vi.fn(),
    replace: vi.fn(),
    replaceAll: vi.fn(),
    replaced: null,
    ...overrides,
  };
}

function renderBar(overrides: Partial<FindController> = {}) {
  const props = renderProps(overrides);
  render(<FindBarView {...props} />);
  return props;
}

describe("FindBar", () => {
  // Regression: under preact/compat `autoFocus` does nothing after page load,
  // so the bar opened with the keyboard still in the note and typed text went
  // into the document.
  it("takes the keyboard from the note when it opens", async () => {
    const note = document.createElement("div");
    note.contentEditable = "true";
    note.tabIndex = 0;
    document.body.append(note);
    note.focus();
    renderBar({ query: "" });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText("Find in file")),
    );
    note.remove();
  });

  it("puts the keyboard in the replacement when Replace opens on an existing query", async () => {
    renderBar({ query: "fox", replaceOpen: true });
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText("Replace with")),
    );
  });

  // Regression: in WKWebView, removing the focused field left the page with no
  // focus, so after Esc neither typing nor ⌘W reached the app.
  it("hands the keyboard back to the note when it closes", async () => {
    const focus = vi.fn();
    attachEditorView({ focus } as unknown as EditorView);
    const { unmount } = render(<FindBarView {...renderProps()} />);
    unmount();
    await vi.waitFor(() => expect(focus).toHaveBeenCalled());
    attachEditorView(null);
  });

  it("renders the counter as current/total (1-based)", () => {
    renderBar({ count: 3, current: 1 });
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("shows 'No results' when a non-empty query matches nothing", () => {
    renderBar({ query: "zzz", count: 0 });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("shows how many Replace All changed instead of the match counter", () => {
    renderBar({ count: 0, replaced: 4 });
    expect(screen.getByText("4 replaced")).toBeInTheDocument();
    expect(screen.queryByText("No results")).toBeNull();
  });

  it("triggers next on Enter", () => {
    const { next, prev } = renderBar();
    fireEvent.keyDown(screen.getByPlaceholderText("Find in file"), { key: "Enter" });
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).not.toHaveBeenCalled();
  });

  it("triggers prev on Shift+Enter", () => {
    const { next, prev } = renderBar();
    fireEvent.keyDown(screen.getByPlaceholderText("Find in file"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(prev).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("triggers close on Escape", () => {
    const { close } = renderBar();
    fireEvent.keyDown(screen.getByPlaceholderText("Find in file"), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reports typing via setQuery", () => {
    const { setQuery } = renderBar({ query: "" });
    fireEvent.input(screen.getByPlaceholderText("Find in file"), { target: { value: "cat" } });
    expect(setQuery).toHaveBeenCalledWith("cat");
  });

  it("disables navigation and replace buttons when there are no matches", () => {
    renderBar({ count: 0, query: "zzz", replaceOpen: true });
    expect(screen.getByLabelText("Next match")).toBeDisabled();
    expect(screen.getByLabelText("Previous match")).toBeDisabled();
    expect(screen.getByText("Replace")).toBeDisabled();
    expect(screen.getByText("Replace All")).toBeDisabled();
  });

  it("hides the replace row until it is opened", () => {
    renderBar({ replaceOpen: false });
    expect(screen.queryByPlaceholderText("Replace with")).toBeNull();
  });

  it("replaces the current match on Enter in the replace field", () => {
    const { replace, next } = renderBar({ replaceOpen: true });
    fireEvent.keyDown(screen.getByPlaceholderText("Replace with"), { key: "Enter" });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
