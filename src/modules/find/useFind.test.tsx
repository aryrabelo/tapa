import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { registry } from "@/lib/registry";
import { findModule } from "@/modules/find";
import { FindBar } from "@/modules/find/FindBar";
import { useFind } from "@/modules/find/useFind";
import { useStore } from "@/state/store";

registry.register(findModule);

function Harness() {
  const find = useFind();
  return (
    <div>
      <input
        aria-label="q"
        value={find.query}
        onChange={(e) => find.setQuery((e.target as HTMLInputElement).value)}
      />
      <span data-testid="count">{find.count}</span>
      <span data-testid="current">{find.current}</span>
    </div>
  );
}

describe("useFind", () => {
  it("counts matches in the open note", async () => {
    useStore.getState().setActive("x.md", "the quick brown fox jumps over the lazy fox");

    await registry.runCommand("find.open");
    render(<Harness />);

    fireEvent.input(screen.getByLabelText("q"), { target: { value: "fox" } });

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("current").textContent).toBe("0");
  });

  it("find.replace opens the replace row and Replace All rewrites the note", async () => {
    useStore.getState().setActive("x.md", "Fox, fox and FOX");

    await registry.runCommand("find.replace");
    render(<FindBar />);
    fireEvent.input(screen.getByPlaceholderText("Find in file"), { target: { value: "fox" } });
    fireEvent.click(screen.getByLabelText("Match case"));
    fireEvent.input(screen.getByPlaceholderText("Replace with"), { target: { value: "cat" } });
    fireEvent.click(screen.getByText("Replace All"));

    expect(useStore.getState().content).toBe("Fox, cat and FOX");
    expect(useStore.getState().dirty).toBe(true);
    expect(screen.getByText("1 replaced")).toBeInTheDocument();
  });

  it("find.open shows the bar without the replace row", async () => {
    useStore.getState().setActive("x.md", "text");

    await registry.runCommand("find.replace");
    await registry.runCommand("find.open");
    render(<FindBar />);

    expect(screen.getByPlaceholderText("Find in file")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Replace with")).toBeNull();
  });

  // Regression: with the bar already open, ⌘F / ⌘⌥F changed nothing the bar
  // watched, so after clicking back into the note the keys kept typing there.
  it("⌘F and ⌘⌥F take the keyboard back while the bar is already open", async () => {
    useStore.getState().setActive("x.md", "fox");
    const note = document.createElement("div");
    note.contentEditable = "true";
    note.tabIndex = 0;
    document.body.append(note);

    await registry.runCommand("find.replace");
    render(<FindBar />);
    const findField = screen.getByPlaceholderText("Find in file");
    fireEvent.input(findField, { target: { value: "fox" } });

    note.focus();
    await registry.runCommand("find.replace");
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText("Replace with")),
    );

    await registry.runCommand("find.open");
    note.focus();
    await registry.runCommand("find.open");
    await vi.waitFor(() => expect(document.activeElement).toBe(findField));
    note.remove();
  });
});
