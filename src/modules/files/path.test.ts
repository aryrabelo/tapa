import { describe, expect, it } from "vitest";
import { shortenHome, splitPath, windowTitle } from "./path";

describe("shortenHome", () => {
  it("replaces the home folder with ~ only at a folder boundary", () => {
    expect(shortenHome("/Users/ary/notes/a.md", "/Users/ary")).toBe("~/notes/a.md");
    expect(shortenHome("/Users/ary/notes/a.md", "/Users/ary/")).toBe("~/notes/a.md");
    expect(shortenHome("/Users/ary", "/Users/ary")).toBe("~");
    // A sibling whose name starts like home is not inside home.
    expect(shortenHome("/Users/arya/a.md", "/Users/ary")).toBe("/Users/arya/a.md");
    expect(shortenHome("C:\\Users\\ary\\a.md", "C:\\Users\\ary")).toBe("~\\a.md");
    expect(shortenHome("/x/a.md", null)).toBe("/x/a.md");
  });
});

describe("splitPath", () => {
  it("splits on either separator and keeps the folder's trailing one", () => {
    expect(splitPath("~/notes/a.md")).toEqual({ dir: "~/notes/", name: "a.md" });
    expect(splitPath("C:\\notes\\a.md")).toEqual({ dir: "C:\\notes\\", name: "a.md" });
    expect(splitPath("a.md")).toEqual({ dir: "", name: "a.md" });
  });
});

describe("windowTitle", () => {
  it("names the note and its own folder, and says Edited only while dirty", () => {
    expect(windowTitle("/vault", "ideas/a.md", false)).toBe("a.md — ideas");
    expect(windowTitle("/vault", "a.md", true)).toBe("a.md — vault — Edited");
    expect(windowTitle("/vault/", null, false)).toBe("vault");
    expect(windowTitle(null, null, false)).toBe("Tapa");
  });

  it("shows a note at the top of the disk as in /", () => {
    expect(windowTitle("/", "a.md", false)).toBe("a.md — /");
    expect(windowTitle("/", null, false)).toBe("/");
  });
});
