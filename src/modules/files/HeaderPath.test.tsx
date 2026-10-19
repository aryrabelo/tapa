import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/path", () => ({ homeDir: () => Promise.resolve("/Users/ary") }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "@/lib/toast";
import { HeaderPath } from "./HeaderPath";

describe("HeaderPath", () => {
  it("shows home as ~, lets only the folder part shrink from the left, and copies the full path", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<HeaderPath path="/Users/ary/notes/deep/a.md" />);

    const folder = await screen.findByText((t) => t.includes("~/notes/deep/"));
    expect(folder).toHaveAttribute("dir", "rtl");
    expect(folder).toHaveClass("truncate", "min-w-0");
    expect(screen.getByText("a.md")).toHaveClass("shrink-0", "max-w-full", "truncate");

    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("/Users/ary/notes/deep/a.md");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Path copied"));
  });
});
