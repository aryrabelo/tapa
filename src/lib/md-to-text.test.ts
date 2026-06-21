import { describe, expect, it } from "vitest";
import { mdToText } from "@/lib/md-to-text";

describe("mdToText", () => {
  it("drops fenced code markers but keeps the inner lines", () => {
    expect(mdToText("```ts\nconst x = 1;\n```")).toBe("const x = 1;");
  });

  it("unwraps inline code", () => {
    expect(mdToText("run `npm test` now")).toBe("run npm test now");
  });

  it("unwraps bold, italic, and strikethrough", () => {
    expect(mdToText("**bold** *italic* ~~gone~~")).toBe("bold italic gone");
    expect(mdToText("__b__ _i_")).toBe("b i");
  });

  it("keeps link and image text, drops the URL", () => {
    expect(mdToText("see [docs](https://x.dev)")).toBe("see docs");
    expect(mdToText("![alt text](pic.png)")).toBe("alt text");
  });

  it("strips heading markers", () => {
    expect(mdToText("# Title\n### Sub")).toBe("Title\nSub");
  });

  it("strips blockquote markers", () => {
    expect(mdToText("> quoted line")).toBe("quoted line");
  });

  it("strips list markers (bullets and ordered)", () => {
    expect(mdToText("- one\n* two\n+ three\n1. four\n2) five")).toBe("one\ntwo\nthree\nfour\nfive");
  });

  it("turns a horizontal rule into a blank line", () => {
    expect(mdToText("a\n---\nb")).toBe("a\n\nb");
    expect(mdToText("a\n***\nb")).toBe("a\n\nb");
  });

  it("collapses 3+ blank lines to a single blank line", () => {
    expect(mdToText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(mdToText("\n\n# Hi\n\n")).toBe("Hi");
  });
});
