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

/** True when two ordered path lists name the same files in the same order. */
function samePaths(a: readonly string[], b: readonly string[] | null): boolean {
  return b !== null && a.length === b.length && a.every((p, i) => p === b[i]);
}

// Notes to learn from, read in the background whenever the folder, the open
// files, the active note or the recent list changes the corpus's path list
// (`corpusPaths`, compared by VALUE, not by the store's array identity — a
// rescan that lists the same files is a no-op: no reload, nothing reset).
// The previous notes keep serving suggestions until a reload for the new
// list lands; a load already in flight is allowed to finish, and at most one
// more load (for the latest list requested while it ran) follows it, so a
// stream of changes can never leave the corpus empty or starve it forever. A
// path still in both the old and the new list reuses its already-read text
// instead of re-reading it. The note being edited is left out (never read):
// the editor feeds its live text instead. A file that can't be read is
// skipped. Limitations: a note saved after its text was read keeps that old
// text until the path list changes again, and a path dropped from the list
// only stops being served once the next load (for the list that dropped it)
// lands, not the instant it disappears from the store.
function corpusNotes(getState: ModuleContext["getState"]) {
  let generation = 0;
  let notes = new Map<string, string>();
  let appliedPaths: string[] | null = null;
  let pendingPaths: string[] | null = null;
  let queuedPaths: string[] | null = null;
  let joined: { root: string | null; active: string | null; text: string } | null = null;

  const start = (paths: string[]) => {
    const gen = ++generation;
    const cache = notes;
    const read = (abs: string) =>
      cache.has(abs) ? Promise.resolve(cache.get(abs) as string) : readFile(abs);
    pendingPaths = paths;
    void loadNotes(paths, read, CORPUS_LIMITS, () => gen !== generation).then((loaded) => {
      if (gen !== generation) return;
      notes = loaded;
      appliedPaths = paths;
      joined = null;
      pendingPaths = null;
      if (queuedPaths) {
        const next = queuedPaths;
        queuedPaths = null;
        if (!samePaths(next, appliedPaths)) start(next);
      }
    });
  };

  const refresh = () => {
    const state = getState();
    const recent = getRecents();
    const paths = corpusPaths(state, recent);
    if (samePaths(paths, appliedPaths) || samePaths(paths, pendingPaths)) return;
    if (paths.length === 0) {
      generation++; // cancels any read in flight; nothing left to learn from
      pendingPaths = null;
      queuedPaths = null;
      notes = new Map();
      appliedPaths = [];
      joined = null;
      return;
    }
    if (pendingPaths) {
      queuedPaths = paths;
      return;
    }
    start(paths);
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
    pendingPaths = null;
    queuedPaths = null;
    notes = new Map();
    appliedPaths = null;
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
