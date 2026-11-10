import type { ModuleContext, Module } from "@/lib/registry";
import { getRecents } from "@/lib/recent";
import { readFile } from "@/lib/tauri";
import { aiSuggest, loadAiStatus } from "./ai";
import { type RemoteSuggest, ghostText } from "./ghost";
import { type CorpusLimits, loadNotes, suggest } from "./provider";

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

/**
 * The path of a note `loadNotes` may have cut to fit the budget: the last one
 * it read, when the loaded total reached `maxChars`. Null when nothing was cut.
 */
function budgetCut(loaded: ReadonlyMap<string, string>): string | null {
  let total = 0;
  let last: string | null = null;
  for (const [abs, text] of loaded) {
    total += text.length;
    last = abs;
  }
  return total >= CORPUS_LIMITS.maxChars ? last : null;
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
// instead of re-reading it, except a note the budget may have cut (the last
// one read once the cap was reached), which is read again in full. The list
// the store currently asks for is tracked while a load is pending, so going
// back to the applied list mid-load (A → B → A) loads A again after B lands.
// `ready()` is false until the first load has landed. The note being edited
// is left out (never read): the editor feeds its live text instead. A file
// that can't be read is skipped. Limitations: a note saved after its text was
// read keeps that old text until the path list changes again, and a path
// dropped from the list only stops being served once the next load (for the
// list that dropped it) lands, not the instant it disappears from the store.
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
    const cut = budgetCut(cache);
    const read = (abs: string) =>
      abs !== cut && cache.has(abs) ? Promise.resolve(cache.get(abs) as string) : readFile(abs);
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

  let lastRoot: string | null = null;
  let lastSingle = false;
  let lastFiles: readonly string[] | null = null;
  let lastOpenFiles: readonly string[] | null = null;
  let lastActivePath: string | null = null;
  let lastRecent: readonly string[] | null = null;

  const refresh = () => {
    const state = getState();
    const recent = getRecents();
    // Cheap O(1) guard: most calls (every keystroke/caret move) land here
    // with nothing changed, so corpusPaths's O(files) walk never runs.
    if (
      state.root === lastRoot &&
      state.single === lastSingle &&
      state.files === lastFiles &&
      state.openFiles === lastOpenFiles &&
      state.activePath === lastActivePath &&
      recent === lastRecent
    ) {
      return;
    }
    lastRoot = state.root;
    lastSingle = state.single;
    lastFiles = state.files;
    lastOpenFiles = state.openFiles;
    lastActivePath = state.activePath;
    lastRecent = recent;

    const paths = corpusPaths(state, recent);
    if (paths.length === 0) {
      if (!pendingPaths && samePaths(paths, appliedPaths)) return;
      generation++; // cancels any read in flight; nothing left to learn from
      pendingPaths = null;
      queuedPaths = null;
      notes = new Map();
      appliedPaths = [];
      joined = null;
      return;
    }
    if (pendingPaths) {
      // The latest request wins, even one equal to the applied list (A → B → A
      // must not leave B applied); back to what is loading drops the queue.
      queuedPaths = samePaths(paths, pendingPaths) ? null : paths;
      return;
    }
    if (samePaths(paths, appliedPaths)) return;
    start(paths);
  };

  /**
   * False until the first load has landed (an empty list counts: nothing to
   * learn). While a reload is pending the previous notes keep serving, so it
   * stays true.
   */
  const ready = (): boolean => {
    refresh();
    return appliedPaths !== null;
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
  return { sources, ready, dispose };
}

/**
 * `remote` asked only when the local corpus has had its say: never while the
 * first load is still running (a note being read could match, and nothing may
 * be sent while it might), and never when the loaded notes now match the line
 * (a load that landed after the ghost was computed). Limit: the local ghost
 * is not redrawn the moment a load lands (that would need a view dispatch
 * from here); the next edit or caret move recomputes it.
 */
function localFirst(
  corpus: { ready: () => boolean; sources: () => readonly string[] },
  remote: RemoteSuggest,
): RemoteSuggest {
  return (before, after, signal) => {
    if (!corpus.ready()) return Promise.resolve(null);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    if (suggest(corpus.sources(), line)) return Promise.resolve(null);
    return remote(before, after, signal);
  };
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
    ctx.registerEditorExtension(ghostText(corpus.sources, localFirst(corpus, aiSuggest)));
  },
};
