import { describe, it, expect } from "vitest";
import { resolveSourceOffset, lineStartOffset, type SourceSpan } from "./source-map";

describe("resolveSourceOffset", () => {
  const span: SourceSpan = { soStart: 10, text: "hello world" };

  it("adds clamped local offset to the span start", () => {
    expect(resolveSourceOffset(span, 0)).toBe(10);
    expect(resolveSourceOffset(span, 6)).toBe(16);
  });
  it("clamps local offset into the span text bounds", () => {
    expect(resolveSourceOffset(span, -3)).toBe(10);
    expect(resolveSourceOffset(span, 999)).toBe(21); // 10 + len(11)
  });
});

describe("lineStartOffset", () => {
  const text = "alpha\nbravo\ncharlie";
  it("returns 0 for line 1", () => expect(lineStartOffset(text, 1)).toBe(0));
  it("returns offset after first newline for line 2", () =>
    expect(lineStartOffset(text, 2)).toBe(6));
  it("returns offset of line 3", () => expect(lineStartOffset(text, 3)).toBe(12));
  it("clamps lines past the end to the last line start", () =>
    expect(lineStartOffset(text, 99)).toBe(12));
});
