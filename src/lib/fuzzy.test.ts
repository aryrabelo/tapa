import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyRank } from "./fuzzy";

describe("fuzzyScore", () => {
  it("returns null when query is not a subsequence", () => {
    expect(fuzzyScore("abc", "xyz")).toBeNull();
  });
  it("matches case-insensitively as a subsequence", () => {
    expect(fuzzyScore("RM", "readme.md")).not.toBeNull();
  });
  it("scores contiguous + start-of-word matches higher", () => {
    const contiguous = fuzzyScore("read", "readme.md") ?? Number.NEGATIVE_INFINITY;
    const scattered = fuzzyScore("rdm", "readme.md") ?? Number.NEGATIVE_INFINITY;
    expect(contiguous).toBeGreaterThan(scattered);
  });
});

describe("fuzzyRank", () => {
  it("filters non-matches and orders by score desc", () => {
    const out = fuzzyRank("doc", ["docs/intro.md", "notes.md", "doc.md"]);
    expect(out[0]).toBe("doc.md");
    expect(out).not.toContain("notes.md");
  });
});
