import { create } from "zustand";
import { buildTree, type FileNode } from "@/lib/tree";

interface AppState {
  root: string | null;
  files: string[]; // relative paths
  tree: FileNode[];
  activePath: string | null; // relative path
  content: string;
  dirty: boolean;
  editOffset: number | null; // caret offset when a note opens
  scrollLine: number | null; // 1-based line to scroll to (search jump)

  setFolder: (root: string, files: string[]) => void;
  setActive: (path: string, content: string, offset?: number) => void;
  setContent: (content: string) => void;
  markSaved: () => void;
  setScrollLine: (line: number | null) => void;
}

export const useStore = create<AppState>((set) => ({
  root: null,
  files: [],
  tree: [],
  activePath: null,
  content: "",
  dirty: false,
  editOffset: null,
  scrollLine: null,

  // `files` feeds the ⌘K palette and must stay openable files only; dir entries
  // (trailing "/") are tree-only, so strip them from the flat list.
  setFolder: (root, entries) =>
    set({ root, files: entries.filter((e) => !e.endsWith("/")), tree: buildTree(entries) }),
  setActive: (path, content, offset = 0) =>
    set({
      activePath: path,
      content,
      dirty: false,
      editOffset: offset,
      scrollLine: null,
    }),
  setContent: (content) => set({ content, dirty: true }),
  markSaved: () => set({ dirty: false }),
  setScrollLine: (scrollLine) => set({ scrollLine }),
}));
