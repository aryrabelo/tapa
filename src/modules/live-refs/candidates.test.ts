import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { findCandidates, MAX_TEXTS, uniqueTexts } from "./candidates";

// Same language setup as the app's editor.
function texts(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return findCandidates(state).map((c) => c.text);
}

describe("findCandidates", () => {
  it("finds the owner's reference forms with their exact inner text", () => {
    expect(
      texts(
        "see [herdr-openrig w1BA:p1] and [w1BA:p1]\n[herdr-openrig (2) w1BJ:p1] [bora pane get w1BA:p1]",
      ),
    ).toEqual([
      "herdr-openrig w1BA:p1",
      "w1BA:p1",
      "herdr-openrig (2) w1BJ:p1",
      "bora pane get w1BA:p1",
    ]);
  });

  it("returns positions covering the brackets", () => {
    const state = EditorState.create({ doc: "a [w1:p1] b", extensions: [markdown()] });
    expect(findCandidates(state)).toEqual([{ from: 2, to: 9, text: "w1:p1" }]);
  });

  it("leaves links, reference links, definitions, images and escapes alone", () => {
    expect(
      texts(
        [
          "[w1:p1](http://x)",
          "[w1:p1][ref]",
          "[ref]: http://x",
          "![w1:p1]",
          "\\[w1:p1]",
          "[[w1:p1]]",
          "[a][w1:p1]",
        ].join("\n\n"),
      ),
    ).toEqual([]);
  });

  it("never treats task boxes as references, but finds one later on the line", () => {
    expect(texts("- [ ] todo\n- [x] done\n- [X] done [w1:p1]")).toEqual(["w1:p1"]);
  });

  it("skips code, HTML and URLs", () => {
    const doc = [
      "`[w1:p1]` inline",
      "```\n[w1:p2]\n```",
      "    [w1:p3] indented code",
      "",
      "<div>[w1:p4]</div>",
      "",
      "<!-- [w1:p5] -->",
      "",
      "<https://x.com/[w1:p6]>",
      "",
      "kept [w1:p7]",
    ].join("\n");
    expect(texts(doc)).toEqual(["w1:p7"]);
  });

  it("ignores empty, blank and over-long insides and never crosses lines", () => {
    expect(texts(`[] [   ] [${"a".repeat(161)}] [a\nb]`)).toEqual([]);
    expect(texts(`[${"a".repeat(160)}]`)).toHaveLength(1);
  });

  it("scans only the requested range's lines", () => {
    const state = EditorState.create({ doc: "[a1]\n[b2]\n[c3]", extensions: [markdown()] });
    expect(findCandidates(state, 5, 6).map((c) => c.text)).toEqual(["b2"]);
  });
});

describe("uniqueTexts", () => {
  it("dedupes in first-seen order and caps the list", () => {
    const c = (text: string) => ({ from: 0, to: 0, text });
    expect(uniqueTexts([c("b"), c("a"), c("b")])).toEqual(["b", "a"]);
    expect(uniqueTexts(Array.from({ length: 300 }, (_, i) => c(`t${i}`)))).toHaveLength(MAX_TEXTS);
  });
});
