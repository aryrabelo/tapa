import { describe, it, expect } from "vitest";
import { resolveSourceOffset, type SourceSpan } from "./source-map";

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
