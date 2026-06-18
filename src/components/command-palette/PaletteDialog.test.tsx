import { describe, expect, it } from "vitest";
import { isAbsolutePath } from "@/components/command-palette/PaletteDialog";

describe("isAbsolutePath", () => {
  it("detects POSIX, Windows-drive, and UNC absolute paths", () => {
    expect(isAbsolutePath("/Users/x/notes/foo.md")).toBe(true);
    expect(isAbsolutePath("C:\\notes\\foo.md")).toBe(true);
    expect(isAbsolutePath("C:/notes/foo.md")).toBe(true);
    expect(isAbsolutePath("\\\\host\\share\\foo.md")).toBe(true);
  });

  it("rejects relative names and fuzzy queries", () => {
    expect(isAbsolutePath("notes/foo.md")).toBe(false);
    expect(isAbsolutePath("foo")).toBe(false);
    expect(isAbsolutePath("C:notes")).toBe(false); // drive without a separator
    expect(isAbsolutePath("")).toBe(false);
  });
});
