import { create } from "zustand";
import { buildTree, type FileNode } from "@/lib/tree";

type Mode = "reader" | "edit";

interface AppState {
  root: string | null;
  files: string[]; // relative paths
  tree: FileNode[];
  activePath: string | null; // relative path
  content: string;
  mode: Mode;
  dirty: boolean;
  editOffset: number | null; // source offset to place the cursor on edit entry
  scrollLine: number | null; // 1-based line the reader should scroll to (search jump)

  setFolder: (root: string, files: string[]) => void;
  setActive: (path: string, content: string) => void;
  setContent: (content: string) => void;
  enterEdit: (offset: number) => void;
  exitEdit: () => void;
  markSaved: () => void;
  setScrollLine: (line: number | null) => void;
}

export const useStore = create<AppState>((set) => ({
  root: null,
  files: [],
  tree: [],
  activePath: null,
  content: "",
  mode: "reader",
  dirty: false,
  editOffset: null,
  scrollLine: null,

  setFolder: (root, files) => set({ root, files, tree: buildTree(files) }),
  setActive: (path, content) =>
    set({
      activePath: path,
      content,
      mode: "reader",
      dirty: false,
      editOffset: null,
      scrollLine: null,
    }),
  setContent: (content) => set({ content, dirty: true }),
  enterEdit: (offset) => set({ mode: "edit", editOffset: offset }),
  exitEdit: () => set({ mode: "reader", editOffset: null }),
  markSaved: () => set({ dirty: false }),
  setScrollLine: (scrollLine) => set({ scrollLine }),
}));
