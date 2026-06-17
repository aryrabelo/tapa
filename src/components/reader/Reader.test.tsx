import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Reader } from "./Reader";

afterEach(() => {
  // @ts-expect-error test cleanup
  delete (document as Document & { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
  // @ts-expect-error test cleanup
  delete (document as Document & { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
});

describe("Reader", () => {
  it("renders GFM elements (heading, table, task list)", () => {
    const md = "# Title\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    render(<Reader content={md} onEditAt={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("attaches data-so source offsets to block nodes", () => {
    const { container } = render(<Reader content={"# Title\n"} onEditAt={() => {}} />);
    const h1 = container.querySelector("h1");
    expect(h1?.getAttribute("data-so")).toBe("0");
  });

  it("strips YAML frontmatter instead of rendering it as a heading", () => {
    const md = "---\nname: replay\ndescription: a saved flow\n---\n\nBody paragraph here.\n";
    render(<Reader content={md} onEditAt={() => {}} />);
    // Frontmatter must not leak into the rendered prose...
    expect(screen.queryByText(/name: replay/)).not.toBeInTheDocument();
    // ...and the trailing "---" must not turn the block into a setext heading.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // The real body still renders.
    expect(screen.getByText("Body paragraph here.")).toBeInTheDocument();
  });

  it("double-click maps the clicked position to a source offset and calls onEditAt", () => {
    const onEditAt = vi.fn();
    const { container } = render(<Reader content={"# Title\n"} onEditAt={onEditAt} />);
    const h1 = container.querySelector("h1");
    if (!h1) throw new Error("h1 not rendered");
    const textNode = h1.firstChild; // the 'Title' text node, parent <h1 data-so="0">
    (
      document as unknown as {
        caretPositionFromPoint: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint = () => ({ offsetNode: textNode as Node, offset: 3 });
    fireEvent.dblClick(h1);
    // h1 data-so = 0, caret offset 3 within 'Title' => source offset 3
    expect(onEditAt).toHaveBeenCalledWith(3);
  });

  it("double-click falls back to caretRangeFromPoint (WebKit/WKWebView)", () => {
    const onEditAt = vi.fn();
    const { container } = render(<Reader content={"# Title\n"} onEditAt={onEditAt} />);
    const h1 = container.querySelector("h1");
    if (!h1) throw new Error("h1 not rendered");
    const textNode = h1.firstChild; // the 'Title' text node, parent <h1 data-so="0">
    // WKWebView exposes caretRangeFromPoint, not caretPositionFromPoint.
    (
      document as unknown as {
        caretRangeFromPoint: (
          x: number,
          y: number,
        ) => { startContainer: Node; startOffset: number };
      }
    ).caretRangeFromPoint = () => ({ startContainer: textNode as Node, startOffset: 3 });
    fireEvent.dblClick(h1);
    expect(onEditAt).toHaveBeenCalledWith(3);
  });
});
