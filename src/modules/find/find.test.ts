import { describe, expect, it } from "vitest";
import { findMatches } from "@/modules/find/find";

describe("findMatches", () => {
  it("finds every non-overlapping occurrence with correct offsets", () => {
    // indices:        0123456789...
    const text = "the cat sat on the mat";
    expect(findMatches(text, "at")).toEqual([
      { start: 5, end: 7 }, // c[at]
      { start: 9, end: 11 }, // s[at]
      { start: 20, end: 22 }, // m[at]
    ]);
  });

  it("is case-insensitive", () => {
    expect(findMatches("Fox FOX fox", "fox")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it("does not overlap, advancing past each hit", () => {
    // "aaaa" with needle "aa" -> [0,2) and [2,4), not [1,3).
    expect(findMatches("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("returns [] for an empty or whitespace-only needle", () => {
    expect(findMatches("hello", "")).toEqual([]);
    expect(findMatches("hello", "   ")).toEqual([]);
  });

  it("returns [] when the needle is absent", () => {
    expect(findMatches("hello world", "xyz")).toEqual([]);
  });

  it("returns [] when the needle is longer than the haystack", () => {
    expect(findMatches("hi", "hello")).toEqual([]);
  });

  it("reports the right count on a known string", () => {
    expect(findMatches("banana", "an")).toHaveLength(2);
  });
});
