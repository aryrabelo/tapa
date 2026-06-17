import { describe, it, expect } from "vitest";
import { buildTree } from "./tree";

describe("buildTree", () => {
  it("nests directories and sorts dirs-before-files, alpha", () => {
    const tree = buildTree(["b.md", "docs/z.md", "docs/a.md", "a.md"]);
    expect(tree.map((n) => n.name)).toEqual(["docs", "a.md", "b.md"]);
    const docs = tree[0];
    expect(docs.kind).toBe("dir");
    expect(docs.children?.map((n) => n.name)).toEqual(["a.md", "z.md"]);
  });

  it("sets full relative path on file nodes", () => {
    const tree = buildTree(["docs/a.md"]);
    expect(tree[0].children?.[0].path).toBe("docs/a.md");
  });
});
