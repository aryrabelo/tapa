import type { ModuleContext, Module } from "@/lib/registry";
import { readFile } from "@/lib/tauri";
import { ghostText } from "./ghost";
import { type CorpusLimits, loadNotes } from "./provider";

const CORPUS_LIMITS: CorpusLimits = { maxFiles: 500, maxChars: 2_000_000 };

// Notes of the open folder, read once per folder in the background. The note
// being edited is left out (never read): the editor feeds its live text instead.
// Limitations: a note saved after the load keeps its old text here, and the
// note that was open during the load stays out, until the folder's file list
// changes.
function folderNotes(getState: ModuleContext["getState"]) {
  let root: string | null = null;
  let files: readonly string[] | null = null;
  let generation = 0;
  let notes = new Map<string, string>();
  let joined: { active: string | null; text: string } | null = null;

  const refresh = () => {
    const state = getState();
    if (state.root === root && state.files === files) return;
    root = state.root;
    files = state.files;
    notes = new Map();
    joined = null;
    const gen = ++generation;
    const dir = root;
    if (!dir) return;
    const skip = state.activePath;
    void loadNotes(
      files.filter((rel) => rel !== skip),
      (rel) => readFile(`${dir}/${rel}`),
      CORPUS_LIMITS,
      () => gen !== generation,
    ).then((loaded) => {
      if (gen !== generation) return;
      notes = loaded;
      joined = null;
    });
  };

  const sources = (): readonly string[] => {
    refresh();
    const { activePath } = getState();
    if (joined?.active !== activePath) {
      const parts: string[] = [];
      for (const [rel, text] of notes) if (rel !== activePath) parts.push(text);
      joined = { active: activePath, text: parts.join("\n\n") };
    }
    return [joined.text];
  };

  const dispose = () => {
    generation++; // drops any read still in flight
    notes = new Map();
    joined = null;
  };

  refresh();
  return { sources, dispose };
}

// Suggests the rest of a word, as ghost text, from what the open folder's notes
// already say. Local only: nothing leaves the machine.
export const autocompleteModule: Module = {
  id: "autocomplete",
  register() {},
  activate(ctx) {
    const corpus = folderNotes(ctx.getState);
    ctx.onDispose(corpus.dispose);
    ctx.registerEditorExtension(ghostText(corpus.sources));
  },
};
