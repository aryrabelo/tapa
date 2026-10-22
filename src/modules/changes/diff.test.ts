import { describe, expect, it } from "vitest";
import { sentenceChanges } from "./diff";

describe("sentenceChanges", () => {
  it("reports an appended sentence as added, never as a diff line", () => {
    const changes = sentenceChanges("O rio é longo.", "O rio é longo. A noite chegou.");
    expect(changes).toEqual([{ kind: "added", text: "A noite chegou." }]);
    for (const c of changes) expect(c.text).not.toMatch(/^[+-]/);
  });

  it("reports a removed sentence", () => {
    expect(sentenceChanges("One. Two. Three.", "One. Three.")).toEqual([
      { kind: "removed", text: "Two." },
    ]);
  });

  it("returns [] for identical documents", () => {
    expect(sentenceChanges("# T\n\nA b. C d.\n", "# T\n\nA b. C d.\n")).toEqual([]);
  });

  it("ignores whitespace and soft-wrap differences", () => {
    expect(sentenceChanges("Hello   there.\nHow are you?", "Hello there. How\nare you?")).toEqual(
      [],
    );
  });

  it("does not report a reordering of identical sentences", () => {
    expect(
      sentenceChanges("Alpha one. Beta two. Gamma three.", "Gamma three. Alpha one. Beta two."),
    ).toEqual([]);
  });

  it("returns replacements in document order", () => {
    expect(sentenceChanges("A one. B two. C three.", "A one. B changed. C three.")).toEqual([
      { kind: "removed", text: "B two." },
      { kind: "added", text: "B changed." },
    ]);
  });

  it("reports a changed table cell as text without pipes", () => {
    const before = "| Item | Price |\n|---|---|\n| Tea | 3 |\n";
    const after = "| Item | Price |\n|---|---|\n| Tea | 4 |\n";
    const changes = sentenceChanges(before, after);
    expect(changes).toEqual([
      { kind: "removed", text: "3" },
      { kind: "added", text: "4" },
    ]);
    for (const c of changes) expect(c.text).not.toContain("|");
  });

  it("drops table separator rows and treats unpunctuated cells as units", () => {
    const changes = sentenceChanges("", "Name | Age\n:--|--:\nAna | 30\n");
    expect(changes.map((c) => c.text)).toEqual(["Name", "Age", "Ana", "30"]);
  });

  it("strips heading, bold and link syntax", () => {
    const changes = sentenceChanges(
      "",
      "# Title\n\nSome **bold** and [a link](http://x.test) here.\n",
    );
    expect(changes).toEqual([
      { kind: "added", text: "Title" },
      { kind: "added", text: "Some bold and a link here." },
    ]);
  });

  it("strips emphasis, images, list and quote markers", () => {
    const text =
      "- *one* item.\n1. ![alt text](a.png) two.\n> quoted ~~gone~~ words.\n- [x] done task.";
    expect(sentenceChanges("", text).map((c) => c.text)).toEqual([
      "one item.",
      "alt text two.",
      "quoted gone words.",
      "done task.",
    ]);
  });

  it("keeps snake_case and code span contents", () => {
    expect(sentenceChanges("", "Use `a*b*c` and my_var_name now.").map((c) => c.text)).toEqual([
      "Use a*b*c and my_var_name now.",
    ]);
  });

  it("ignores frontmatter", () => {
    const before = "---\ntitle: A\n---\nBody text.\n";
    const after = "---\ntitle: B\ntags: x\n---\nBody text.\n";
    expect(sentenceChanges(before, after)).toEqual([]);
  });

  it("counts code fence contents as text but not the fence markers", () => {
    const changes = sentenceChanges("", "```ts\nconst x = 1;\n```\n");
    expect(changes).toEqual([{ kind: "added", text: "const x = 1;" }]);
  });

  it("does not split on abbreviations or decimals", () => {
    const text = "O Sr. Silva e a Dra. Ana pagaram 3.5 reais, e.g. hoje. Fim.";
    expect(sentenceChanges("", text).map((c) => c.text)).toEqual([
      "O Sr. Silva e a Dra. Ana pagaram 3.5 reais, e.g. hoje.",
      "Fim.",
    ]);
  });

  it("splits on ! and ? and keeps closing quotes with the sentence", () => {
    expect(sentenceChanges("", 'Ele disse "vamos!" Será? Sim.').map((c) => c.text)).toEqual([
      'Ele disse "vamos!"',
      "Será?",
      "Sim.",
    ]);
  });

  it("ignores horizontal rules", () => {
    expect(sentenceChanges("A b.\n\n---\n\nC d.", "A b.\n\n***\n\nC d.")).toEqual([]);
  });
});
