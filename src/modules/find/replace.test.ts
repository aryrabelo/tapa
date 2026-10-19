import { describe, expect, it } from "vitest";
import { history, redo, undo } from "@codemirror/commands";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { type ReplaceTarget, replaceAll, replaceOne } from "@/modules/find/replace";

// A headless stand-in for the EditorView: same state + dispatch shape, with
// undo history, so undo grouping is observed the way the editor would see it.
function editor(doc: string) {
  let state = EditorState.create({ doc, extensions: [history()] });
  const target: ReplaceTarget & { text(): string } = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    text: () => state.doc.toString(),
  };
  const run = (cmd: typeof undo) =>
    cmd({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    });
  return { target, undo: () => run(undo), redo: () => run(redo) };
}

describe("replaceAll", () => {
  it("replaces every match, returns the count, and one undo restores them all", () => {
    const ed = editor("cat, Cat and cat");
    ed.target.dispatch({ changes: { from: 0, insert: "> " } }); // earlier, separate edit

    expect(replaceAll(ed.target, "cat", "dog", {})).toBe(3);
    expect(ed.target.text()).toBe("> dog, dog and dog");

    // Typing right after, next to the last replacement, stays a separate step.
    ed.target.dispatch({ changes: { from: 18, insert: "!" }, userEvent: "input.type" });
    expect(ed.undo()).toBe(true);
    expect(ed.target.text()).toBe("> dog, dog and dog");

    expect(ed.undo()).toBe(true);
    expect(ed.target.text()).toBe("> cat, Cat and cat");
    // The edit before it is still its own step.
    expect(ed.undo()).toBe(true);
    expect(ed.target.text()).toBe("cat, Cat and cat");
  });

  it("only touches exact-case matches when caseSensitive is on", () => {
    const ed = editor("cat, Cat and cat");
    expect(replaceAll(ed.target, "cat", "dog", { caseSensitive: true })).toBe(2);
    expect(ed.target.text()).toBe("dog, Cat and dog");
  });

  it("changes nothing and adds no undo step when there is no match", () => {
    const ed = editor("hello");
    expect(replaceAll(ed.target, "zzz", "x", {})).toBe(0);
    expect(ed.undo()).toBe(false);
  });
});

describe("replaceOne", () => {
  it("replaces only the chosen match and points at the next one", () => {
    const ed = editor("a cat, a cat, a cat");
    expect(replaceOne(ed.target, "cat", "dog", {}, 1)).toBe(1);
    expect(ed.target.text()).toBe("a cat, a dog, a cat");
  });

  it("does not re-match its own replacement text", () => {
    // Replacing "a" with "aa": the next match must be the following "a", not
    // the one just inserted, or Replace would grow the same spot forever.
    const ed = editor("a b a");
    expect(replaceOne(ed.target, "a", "aa", {}, 0)).toBe(2); // [aa] b [a] -> index of last "a"
    expect(ed.target.text()).toBe("aa b a");
  });

  it("wraps to the first match after replacing the last one", () => {
    const ed = editor("cat cat cat");
    expect(replaceOne(ed.target, "cat", "dog", {}, 2)).toBe(0);
  });

  it("reports -1 once nothing is left, and skips other-case matches when caseSensitive", () => {
    const ed = editor("Cat cat");
    expect(replaceOne(ed.target, "cat", "dog", { caseSensitive: true }, 0)).toBe(-1);
    expect(ed.target.text()).toBe("Cat dog");
  });
});
