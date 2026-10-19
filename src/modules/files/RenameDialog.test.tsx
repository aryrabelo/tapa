import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "@/state/store";
import { RenameDialog } from "./RenameDialog";

describe("RenameDialog", () => {
  // Regression: the Radix version threw on mount under preact/compat, so
  // Rename… showed nothing and the keyboard stayed in the note.
  it("opens with the name selected up to the extension, ready to type", async () => {
    useStore.getState().setFolder("/vault", ["notes/idea.md"], false);
    useStore.getState().setActive("notes/idea.md", "x");
    useStore.getState().setRenameOpen(true);
    render(<RenameDialog />);
    const input = screen.getByLabelText("New name") as HTMLInputElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe("idea.md");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  });

  it("closes on Escape without renaming", () => {
    useStore.getState().setFolder("/vault", ["a.md"], false);
    useStore.getState().setActive("a.md", "x");
    useStore.getState().setRenameOpen(true);
    render(<RenameDialog />);
    fireEvent.keyDown(screen.getByLabelText("New name"), { key: "Escape" });
    expect(useStore.getState().renameOpen).toBe(false);
    expect(useStore.getState().activePath).toBe("a.md");
  });

  // Regression: the box kept the old name while another note opened, and
  // Rename then renamed that other note.
  it("closes when a different note opens while it is up", async () => {
    useStore.getState().setFolder("/vault", ["a.md", "b.md"], false);
    useStore.getState().setActive("a.md", "x");
    useStore.getState().setRenameOpen(true);
    render(<RenameDialog />);
    useStore.getState().setActive("b.md", "y");
    await vi.waitFor(() => expect(useStore.getState().renameOpen).toBe(false));
  });

  it("keeps Tab inside the box, wrapping both ways", () => {
    useStore.getState().setFolder("/vault", ["a.md"], false);
    useStore.getState().setActive("a.md", "x");
    useStore.getState().setRenameOpen(true);
    render(<RenameDialog />);
    const input = screen.getByLabelText("New name");
    const rename = screen.getByRole("button", { name: "Rename" });
    rename.focus();
    fireEvent.keyDown(rename, { key: "Tab" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(rename);
  });
});
