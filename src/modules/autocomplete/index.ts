import type { ModuleContext, Module } from "@/lib/registry";
import { getRecents } from "@/lib/recent";
import { readFile } from "@/lib/tauri";
import { aiSuggest, loadAiStatus } from "./ai";
import { ghostText } from "./ghost";
import { type CorpusLimits, loadNotes } from "./provider";

const CORPUS_LIMITS: CorpusLimits = { maxFiles: 500, maxChars: 2_000_000 };
const MARKDOWN = /\.(?:md|markdown)$/i;

/** One spelling per file, so "C:\a\b.md", "C:\a/b.md" and "//b.md" meet. */
const pathKey = (abs: string): string => abs.replace(/[\\/]+/g, "/");

/** The store fields the corpus is built from. */
interface CorpusState {
  root: string | null;
  single: boolean;
  files: readonly string[];
  openFiles: readonly string[];
  activePath: string | null;
}

/**
 * Absolute paths to learn from, most deliberately opened first, so the cap
 * drops folder notes before them: the other open files (single-file mode), the
 * recent Markdown files (recent folders and other files are left out), then the
 * open folder's notes. The note being edited is never listed.
 */
function corpusPaths(state: CorpusState, recents: readonly string[]): string[] {
  const { root, single, files, openFiles, activePath } = state;
  const seen = new Set<string>();
  if (root && activePath) seen.add(pathKey(`${root}/${activePath}`));
  const paths: string[] = [];
  const add = (abs: string) => {
    const key = pathKey(abs);
    if (seen.has(key)) return;
    seen.add(key);
    paths.push(abs);
  };
  if (single) for (const abs of openFiles) add(abs);
  for (const abs of recents) if (MARKDOWN.test(abs)) add(abs);
  if (root) for (const rel of files) add(`${root}/${rel}`);
  return paths;
}

// Notes to learn from, read in the background whenever the folder, the open
// files or the recent list changes. The note being edited is left out (never
// read): the editor feeds its live text instead. A file that can't be read is
// skipped. Limitations: a note saved after the load keeps its old text here,
// and the note that was open during the load stays out, until one of those
// lists changes.
function corpusNotes(getState: ModuleContext["getState"]) {
  let root: string | null = null;
  let files: readonly string[] | null = null;
  let openFiles: readonly string[] | null = null;
  let recents: readonly string[] | null = null;
  let generation = 0;
  let notes = new Map<string, string>();
  let joined: { root: string | null; active: string | null; text: string } | null = null;

  const refresh = () => {
    const state = getState();
    const recent = getRecents();
    if (
      state.root === root &&
      state.files === files &&
      state.openFiles === openFiles &&
      recent === recents
    ) {
      return;
    }
    root = state.root;
    files = state.files;
    openFiles = state.openFiles;
    recents = recent;
    notes = new Map();
    joined = null;
    const gen = ++generation;
    const paths = corpusPaths(state, recent);
    if (paths.length === 0) return;
    void loadNotes(paths, readFile, CORPUS_LIMITS, () => gen !== generation).then((loaded) => {
      if (gen !== generation) return;
      notes = loaded;
      joined = null;
    });
  };

  const sources = (): readonly string[] => {
    refresh();
    const { root: dir, activePath } = getState();
    if (!joined || joined.root !== dir || joined.active !== activePath) {
      const live = dir && activePath ? pathKey(`${dir}/${activePath}`) : null;
      const parts: string[] = [];
      for (const [abs, text] of notes) if (pathKey(abs) !== live) parts.push(text);
      joined = { root: dir, active: activePath, text: parts.join("\n\n") };
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

// Suggests the rest of a word, as ghost text, from what the user's other notes
// already say. That part is local only. When the notes have nothing, the
// optional AI continuation (off by default, the user's own key) may be asked.
export const autocompleteModule: Module = {
  id: "autocomplete",
  register() {},
  activate(ctx) {
    const corpus = corpusNotes(ctx.getState);
    ctx.onDispose(corpus.dispose);
    void loadAiStatus();
    ctx.registerEditorExtension(ghostText(corpus.sources, aiSuggest));
  },
};
