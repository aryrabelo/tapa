import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppSidebar } from "./AppSidebar";
import type { FileNode } from "@/lib/tree";

const tree: FileNode[] = [
  {
    name: "docs",
    path: "docs",
    kind: "dir",
    children: [{ name: "a.md", path: "docs/a.md", kind: "file" }],
  },
  { name: "b.md", path: "b.md", kind: "file" },
];

describe("AppSidebar", () => {
  it("renders dirs and files", () => {
    render(
      <AppSidebar
        tree={tree}
        active={null}
        onPick={() => {}}
        onNewFile={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();
  });

  it("collapses and expands a directory", () => {
    render(
      <AppSidebar
        tree={tree}
        active={null}
        onPick={() => {}}
        onNewFile={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(screen.getByText("a.md")).toBeInTheDocument();
    fireEvent.click(screen.getByText("docs")); // collapse
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("docs")); // expand
    expect(screen.getByText("a.md")).toBeInTheDocument();
  });

  it("calls onPick with the file path on click", () => {
    const onPick = vi.fn();
    render(
      <AppSidebar
        tree={tree}
        active={null}
        onPick={onPick}
        onNewFile={() => {}}
        onCreate={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("b.md"));
    expect(onPick).toHaveBeenCalledWith("b.md");
  });

  it("highlights the active file", () => {
    render(
      <AppSidebar
        tree={tree}
        active="b.md"
        onPick={() => {}}
        onNewFile={() => {}}
        onCreate={() => {}}
      />,
    );
    const btn = screen.getByText("b.md").closest("button");
    expect(btn?.className).toContain("bg-accent");
  });

  it("renders a New file action that calls onNewFile", () => {
    const onNewFile = vi.fn();
    render(
      <AppSidebar
        tree={tree}
        active={null}
        onPick={() => {}}
        onNewFile={onNewFile}
        onCreate={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(onNewFile).toHaveBeenCalledTimes(1);
  });

  it("shows a hint instead of the tree when no folder is open", () => {
    render(
      <AppSidebar
        tree={[]}
        active={null}
        onPick={() => {}}
        onNewFile={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(screen.getByText(/no folder open/i)).toBeInTheDocument();
  });
});
