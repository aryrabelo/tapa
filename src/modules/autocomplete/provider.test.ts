import { describe, expect, it } from "vitest";
import { loadNotes, queriesFor, suggest } from "./provider";

describe("suggest", () => {
  it("finishes the word from a note that contains it", () => {
    expect(suggest(["Ontem vi o rio Tapajós."], "o rio T")).toBe("apajós");
  });

  it("adds the following words when every occurrence agrees", () => {
    expect(suggest(["A ponte sobre o rio Tapajós fica longe daqui, mas"], "o rio T")).toBe(
      "apajós fica longe daqui",
    );
  });

  it("stops at the word when occurrences disagree on what follows", () => {
    const notes = ["o rio Tapajós corre.", "o rio Tapajós é largo."];
    expect(suggest(notes, "o rio T")).toBe("apajós");
  });

  it("picks the most frequent completion", () => {
    const notes = ["o rio Tamanduá.", "o rio Tapajós.", "o rio Tapajós."];
    expect(suggest(notes, "o rio T")).toBe("apajós");
  });

  it("is case-sensitive on what was typed", () => {
    expect(suggest(["o rio Tapajós"], "o rio t")).toBeNull();
  });

  it("does not match inside another word", () => {
    expect(suggest(["um curio Tal"], "rio T")).toBeNull();
  });

  it("prefers the longer context over a single word", () => {
    // "Tap" alone would win by count ("Tapete" x3); "rio Tap" only continues as "Tapajós".
    const notes = ["Tapete Tapete Tapete", "o rio Tapajós"];
    expect(suggest(notes, "o rio Tap")).toBe("ajós");
    expect(suggest(notes, "Tap")).toBe("ete");
  });

  it("needs a word left to finish", () => {
    expect(suggest(["o rio Tapajós corre"], "o rio Tapajós")).toBeNull();
    expect(suggest(["o rio Tapajós"], "o rio ")).toBeNull();
  });

  it("finishes across an inner hyphen", () => {
    expect(suggest(["Seja bem-vindo ao rio."], "Seja bem")).toBe("-vindo ao rio");
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
