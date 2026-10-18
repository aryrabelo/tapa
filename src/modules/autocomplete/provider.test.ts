import { describe, expect, it } from "vitest";
import { loadNotes, MAX_SUGGESTION, queriesFor, suggest } from "./provider";

describe("suggest", () => {
  it("finishes the word from a note that contains it", () => {
    expect(suggest(["Ontem vi o rio Tapajós."], "o rio T")).toBe("apajós.");
  });

  it("continues to the end of the sentence, punctuation included", () => {
    const notes = ["O barco desceu o rio Tapajós ao amanhecer, sem pressa. Depois..."];
    expect(suggest(notes, "Voltou pelo rio T")).toBe("apajós ao amanhecer, sem pressa.");
  });

  it("runs to the end of the note when the sentence has no final punctuation", () => {
    expect(suggest(["A ponte sobre o rio Tapajós fica longe daqui, mas"], "o rio T")).toBe(
      "apajós fica longe daqui, mas",
    );
  });

  it("does not end the sentence at a decimal point", () => {
    expect(suggest(["o rio Tapajós tem 3.5 km de largura. Depois"], "o rio T")).toBe(
      "apajós tem 3.5 km de largura.",
    );
  });

  it("keeps a closing quote after the final punctuation", () => {
    expect(suggest(['Ela disse "o rio Tapajós é largo." e foi.'], "o rio T")).toBe(
      'apajós é largo."',
    );
  });

  it("ends the sentence at closing Markdown emphasis or code after the punctuation", () => {
    expect(suggest(["o rio **Tapajós é largo.** Depois choveu."], "o rio **T")).toBe(
      "apajós é largo.**",
    );
    expect(suggest(["o rio _Tapajós é largo._ Depois choveu."], "o rio _T")).toBe(
      "apajós é largo._",
    );
    expect(suggest(["o rio ~~Tapajós é largo.~~ Depois choveu."], "o rio ~~T")).toBe(
      "apajós é largo.~~",
    );
    expect(suggest(["o rio `Tapajós é largo.` Depois choveu."], "o rio `T")).toBe(
      "apajós é largo.`",
    );
  });

  it("never crosses a line break", () => {
    expect(suggest(["o rio Tapajós ao amanhecer\nsem pressa."], "o rio T")).toBe(
      "apajós ao amanhecer",
    );
    expect(suggest(["o rio Tapajós ao amanhecer\n\nsem pressa."], "o rio T")).toBe(
      "apajós ao amanhecer",
    );
  });

  it("caps a long sentence at a word boundary", () => {
    const steps = Array.from({ length: 30 }, (_, i) => `passo${i}`).join(" ");
    const note = `o rio Tapajós ${steps}.`;
    const tail = suggest([note], "o rio T") ?? "";
    expect(tail.length).toBeLessThanOrEqual(MAX_SUGGESTION);
    expect(tail.length).toBeGreaterThan(MAX_SUGGESTION - 10);
    expect(note.startsWith(`o rio T${tail} `)).toBe(true);
  });

  it("caps at a tab or no-break space too, keeping the words before it", () => {
    for (const gap of ["\t", "\u00a0"]) {
      const steps = Array.from({ length: 30 }, (_, i) => `passo${i}`).join(gap);
      const note = `o rio Tapajós ${steps}.`;
      const tail = suggest([note], "o rio T") ?? "";
      expect(tail.length).toBeLessThanOrEqual(MAX_SUGGESTION);
      expect(tail.length).toBeGreaterThan(MAX_SUGGESTION - 10);
      expect(note.startsWith(`o rio T${tail}${gap}`)).toBe(true);
    }
  });

  it("offers nothing when the rest of the word alone is over the cap", () => {
    expect(suggest([`o rio T${"a".repeat(MAX_SUGGESTION + 1)} fim.`], "o rio T")).toBeNull();
    const fits = "a".repeat(MAX_SUGGESTION);
    expect(suggest([`o rio T${fits} fim.`], "o rio T")).toBe(fits);
  });

  it("keeps the words the occurrences share when they disagree", () => {
    const notes = ["o rio Tapajós ao amanhecer.", "o rio Tapajós ao anoitecer."];
    expect(suggest(notes, "o rio T")).toBe("apajós ao");
  });

  it("keeps what a shorter line agrees on up to where it ends", () => {
    const notes = ["o rio Tapajós ao amanhecer\nfim", "o rio Tapajós ao amanhecer, sem pressa."];
    expect(suggest(notes, "o rio T")).toBe("apajós ao amanhecer");
  });

  it("stops at the word when occurrences disagree right after it", () => {
    const notes = ["o rio Tapajós corre.", "o rio Tapajós é largo."];
    expect(suggest(notes, "o rio T")).toBe("apajós");
  });

  it("picks the most frequent completion", () => {
    const notes = ["o rio Tamanduá.", "o rio Tapajós.", "o rio Tapajós."];
    expect(suggest(notes, "o rio T")).toBe("apajós.");
  });

  it("is case-sensitive on what was typed", () => {
    expect(suggest(["o rio Tapajós"], "o rio t")).toBeNull();
  });

  it("does not match inside another word", () => {
    expect(suggest(["um curio Tal"], "rio T")).toBeNull();
  });

  it("prefers the longer context over a single word", () => {
    const notes = ["Tapete Tapete Tapete", "o rio Tapajós"];
    expect(suggest(notes, "o rio Tap")).toBe("ajós");
    expect(suggest(notes, "Tap")).toBe("ete");
  });

  it("needs a word left to finish", () => {
    expect(suggest(["o rio Tapajós corre"], "o rio Tapajós")).toBeNull();
    expect(suggest(["o rio Tapajós"], "o rio ")).toBeNull();
  });

  it("finishes across an inner hyphen", () => {
    expect(suggest(["Seja bem-vindo ao rio."], "Seja bem")).toBe("-vindo ao rio.");
  });
});

describe("queriesFor", () => {
  it("starts each lookup at a word start in the current sentence", () => {
    expect(queriesFor("Fim. o rio T")).toEqual(["o rio T", "rio T"]);
  });

  it("does not fire below the minimum context", () => {
    expect(queriesFor("Ta")).toEqual([]);
    expect(queriesFor("Tap")).toEqual(["Tap"]);
  });
});

describe("loadNotes", () => {
  const text: Record<string, string> = { "a.md": "aaaa", "b.md": "bbbb", "c.md": "cccc" };
  const read = async (rel: string) => {
    if (rel === "bad.md") throw new Error("gone");
    return text[rel] ?? "";
  };

  it("stops at the character cap and cuts the last note to fit", async () => {
    const notes = await loadNotes(
      ["a.md", "b.md", "c.md"],
      read,
      { maxFiles: 10, maxChars: 6 },
      () => false,
    );
    expect([...notes]).toEqual([
      ["a.md", "aaaa"],
      ["b.md", "bb"],
    ]);
  });

  it("stops at the file cap and skips notes that fail to read", async () => {
    const notes = await loadNotes(
      ["bad.md", "a.md", "b.md"],
      read,
      { maxFiles: 2, maxChars: 100 },
      () => false,
    );
    expect([...notes]).toEqual([["a.md", "aaaa"]]);
  });
});
