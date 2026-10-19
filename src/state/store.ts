import { create } from "zustand";
import { buildTree, type FileNode } from "@/lib/tree";

const SIDEBAR_KEY = "tapa-sidebar";

interface AppState {
  root: string | null;
  /** True when the user opened one file: `root` is its parent and the tree lists only it. */
  single: boolean;
  files: string[]; // relative paths
  tree: FileNode[];
  activePath: string | null; // relative path
  /** Identity of the open note for the editor's React key. A rename keeps it. */
  noteKey: string | null;
  content: string;
  /** What is on disk for the open note, as far as Tapa knows (last read or write). */
  savedContent: string;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  editOffset: number | null; // caret offset when a note opens
  scrollLine: number | null; // 1-based line to scroll to (search jump)
  sidebarOpen: boolean;
  paletteOpen: boolean;
  renameOpen: boolean;

  /** A different root or mode closes the open note; a rescan of the same one keeps it. */
  setFolder: (root: string, files: string[], single: boolean) => void;
  clearFolder: () => void;
  setActive: (path: string, content: string, offset?: number) => void;
  /** The open note now lives at `path` (same content, same editor). */
  moveActive: (path: string) => void;
  closeNote: () => void;
  setContent: (content: string) => void;
  /** `written` is what reached disk; typing during the write keeps the note dirty. */
  markSaved: (written: string) => void;
  setSaving: (saving: boolean, failed?: boolean) => void;
  setScrollLine: (line: number | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setRenameOpen: (open: boolean) => void;
}

/** Storage can be blocked; the sidebar then starts open. */
function storedSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch {
    return true;
  }
}

const noNote = {
  activePath: null,
  noteKey: null,
  content: "",
  savedContent: "",
  dirty: false,
  saveFailed: false,
  editOffset: null,
  scrollLine: null,
  renameOpen: false,
} as const;

export const useStore = create<AppState>((set) => ({
  root: null,
  single: false,
  files: [],
  tree: [],
  ...noNote,
  saving: false,
  sidebarOpen: storedSidebarOpen(),
  paletteOpen: false,

  // `files` feeds the ⌘K palette and must stay openable files only; dir entries
  // (trailing "/") are tree-only, so strip them from the flat list.
  setFolder: (root, entries, single) =>
    set((s) => ({
      ...(s.root !== root || s.single !== single ? noNote : {}),
      root,
      single,
      files: entries.filter((e) => !e.endsWith("/")),
      tree: buildTree(entries),
    })),
  clearFolder: () => set({ ...noNote, root: null, single: false, files: [], tree: [] }),
  setActive: (path, content, offset = 0) =>
    set((s) => ({
      activePath: path,
      noteKey: `${s.root}/${path}`,
      content,
      savedContent: content,
      dirty: false,
      saveFailed: false,
      editOffset: offset,
      scrollLine: null,
    })),
  moveActive: (path) => set({ activePath: path }),
  closeNote: () => set(noNote),
  setContent: (content) => set((s) => ({ content, dirty: content !== s.savedContent })),
  markSaved: (written) =>
    set((s) => ({ savedContent: written, dirty: s.content !== written, saveFailed: false })),
  setSaving: (saving, failed = false) => set({ saving, saveFailed: failed }),
  setScrollLine: (scrollLine) => set({ scrollLine }),
  setSidebarOpen: (sidebarOpen) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "open" : "closed");
    }
    set({ sidebarOpen });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setRenameOpen: (renameOpen) => set({ renameOpen }),
}));
