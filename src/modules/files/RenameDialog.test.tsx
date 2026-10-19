import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "@/state/store";
import { RenameDialog } from "./RenameDialog";

describe("RenameDialog", () => {
  // Regression: the Radix version threw on mount under preact/compat, so
  // Rename… showed nothing and the keyboard stayed in the note.
  it("opens with the name selected up to the extension, ready to type", async () => {
    useStore.getState().setFolder("/vault", ["notes/idea.md"]);
    useStore.getState().setActive("notes/idea.md", "x");
    useStore.getState().setRenameOpen(true);
    render(<RenameDialog />);
    const input = screen.getByLabelText("New name") as HTMLInputElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe("idea.md");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  });

  it("closes on Escape without renaming", () => {
    useStore.getState().setFolder("/vault", ["a.md"]);
    useStore.getState().setActive("a.md", "x");
    useStore.getState().setRenameOpen(true);
    render(<RenameDialog />);
    fireEvent.keyDown(screen.getByLabelText("New name"), { key: "Escape" });
    expect(useStore.getState().renameOpen).toBe(false);
    expect(useStore.getState().activePath).toBe("a.md");
  });
});
