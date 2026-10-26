import { history, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePreview, markersRevealed } from "@/components/editor/live-preview";
import { tableWidgets } from "@/components/editor/table-widget";
import { attachEditorView } from "@/lib/editor-view";
import type { PreviousVersion } from "@/lib/tauri";
import { useStore } from "@/state/store";

const previousVersion = vi.fn<(path: string) => Promise<PreviousVersion | null>>();
vi.mock("@/lib/tauri", () => ({ previousVersion: (p: string) => previousVersion(p) }));

import { isReviewing, remainingChanges, reviewOpenNote, startReview, undoAll } from "./review";

const BASE = "# Plan\n\nThe river is long.\n\nThe night came.\n\nWe walked home.\n";
// Two changes: a word added in the first paragraph, a word swapped in the last.
const EDITED = "# Plan\n\nThe river is very long.\n\nThe night came.\n\nWe ran home.\n";

const views: EditorView[] = [];
let typed: string[];

function mount(doc: string, extra: unknown[] = []): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        markdown({ base: markdownLanguage }),
        // What App does with the editor's text: the store, then autosave.
        EditorView.updateListener.of((u) => {
          if (u.docChanged) typed.push(u.state.doc.toString());
        }),
        ...(extra as []),
      ],
    }),
    parent: document.body,
  });
  views.push(view);
  attachEditorView(view);
  return view;
}

const buttons = (view: EditorView, name: "accept" | "reject") =>
  view.dom.querySelectorAll<HTMLButtonElement>(`.cm-deletedChunk button[name=${name}]`);

const flush = () => new Promise<void>((r) => queueMicrotask(r));

beforeEach(() => {
  typed = [];
  previousVersion.mockReset();
  useStore.setState({ root: "/notes", activePath: "river.md" });
});

afterEach(() => {
  attachEditorView(null);
  for (const v of views.splice(0)) v.destroy();
});

describe("review in the text", () => {
  it("Undo on one change puts back exactly that base text, as a normal edit ⌘Z restores", () => {
    const view = mount(EDITED);
    expect(startReview(view, { source: "git", text: BASE })).toBe(true);
    expect(remainingChanges(view.state)).toBe(2);

    buttons(view, "reject")[0].click();

    expect(view.state.doc.toString()).toBe(
      "# Plan\n\nThe river is long.\n\nThe night came.\n\nWe ran home.\n",
    );
    expect(remainingChanges(view.state)).toBe(1);
    expect(typed.at(-1)).toBe(view.state.doc.toString()); // reaches the store and autosave

    undo(view);
    expect(view.state.doc.toString()).toBe(EDITED);
  });

  it("Keep takes a change off the count without touching the note", () => {
    const view = mount(EDITED);
    startReview(view, { source: "saved", text: BASE });

    buttons(view, "accept")[0].click();

    expect(view.state.doc.toString()).toBe(EDITED);
    expect(remainingChanges(view.state)).toBe(1);
    expect(typed).toEqual([]);
    expect(view.dom.querySelector(".cm-tapa-review-count")?.textContent).toBe("1 change left");
  });

  it("Undo all makes the note equal to the base, then review ends on its own", async () => {
    // A paragraph added, one removed, and the last line changed without its newline.
    const view = mount("# Plan\n\nA new opening.\n\nThe river is long.\n\nWe walked home, slowly.");
    startReview(view, { source: "git", text: BASE });
    expect(remainingChanges(view.state)).toBeGreaterThan(1);

    undoAll(view);

    expect(view.state.doc.toString()).toBe(BASE);
    await flush();
    expect(isReviewing(view.state)).toBe(false);
    expect(view.dom.querySelector(".cm-tapa-review")).toBeNull();
  });

  it("leaves review with the note, and a slow earlier version never lands on the next note", async () => {
    previousVersion.mockResolvedValueOnce({ source: "git", text: BASE });
    const river = mount(EDITED);
    expect(await reviewOpenNote()).toBe("started");
    expect(previousVersion).toHaveBeenCalledWith("/notes/river.md");
    expect(document.querySelector(".cm-tapa-review")).not.toBeNull();

    // Switch notes the way App does: the old editor goes, a new one comes.
    let answer: (v: PreviousVersion) => void = () => {};
    previousVersion.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const otherNote = () => {
      attachEditorView(null);
      views.splice(views.indexOf(river), 1);
      river.destroy();
      useStore.setState({ activePath: "sea.md" });
      return mount("The sea is calm.\n");
    };
    const sea = otherNote();
    expect(document.querySelector(".cm-tapa-review")).toBeNull();

    // Asked on sea.md, answered after sea.md was left for tide.md.
    const pending = reviewOpenNote();
    attachEditorView(null);
    useStore.setState({ activePath: "tide.md" });
    const tide = mount("The tide is out.\n");
    answer({ source: "git", text: "Something else entirely.\n" });

    expect(await pending).toBe("stale");
    expect(isReviewing(sea.state) || isReviewing(tide.state)).toBe(false);
    expect(document.querySelector(".cm-tapa-review")).toBeNull();
  });

  it("Escape leaves review, unless a panel above the note takes it", () => {
    const view = mount(EDITED);
    startReview(view, { source: "git", text: BASE });

    useStore.setState({ paletteOpen: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(isReviewing(view.state)).toBe(true);

    useStore.setState({ paletteOpen: false });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    expect(isReviewing(view.state)).toBe(false);
    expect(view.state.doc.toString()).toBe(EDITED);
  });

  it("shows changes next to formatted reading, and a changed table as its source", () => {
    const unchanged = "| Day | Km |\n| --- | --- |\n| Mon | 5 |\n";
    const base = `# Plan\n\n| Item | Cost |\n| --- | --- |\n| Rope | 10 |\n\n${unchanged}`;
    const edited = `# The plan\n\n| Item | Cost |\n| --- | --- |\n| Rope | 12 |\n\n${unchanged}`;
    const view = mount(edited, [markersRevealed, livePreview, tableWidgets]);
    expect(view.dom.querySelectorAll(".tapa-table")).toHaveLength(2);

    startReview(view, { source: "git", text: base });

    // A drawn table would cover the change in it; the other table stays drawn.
    expect(remainingChanges(view.state)).toBe(2);
    expect(view.dom.querySelectorAll(".cm-deletedChunk")).toHaveLength(2);
    expect(view.dom.querySelectorAll(".tapa-table")).toHaveLength(1);
    const removed = [...view.dom.querySelectorAll(".cm-deletedText")].map((e) => e.textContent);
    expect(removed).toContain("0");

    buttons(view, "accept")[1].click();
    expect(view.dom.querySelectorAll(".tapa-table")).toHaveLength(2);
  });
});
