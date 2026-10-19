import { EditorState } from "@codemirror/state";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getEditorView } from "@/lib/editor-view";
import { registry, useActivePanel } from "@/lib/registry";
import { useStore } from "@/state/store";
import { findMatches } from "./find";
import { getFocusRequest, getReplaceOpen, setReplaceOpen, subscribeFindMode } from "./mode";
import { type ReplaceTarget, replaceAll, replaceOne } from "./replace";

export interface FindController {
  query: string;
  setQuery: (q: string) => void;
  caseSensitive: boolean;
  toggleCaseSensitive: () => void;
  count: number;
  current: number; // 0-based index of the active match, -1 when there are none
  next: () => void;
  prev: () => void;
  close: () => void;
  replaceOpen: boolean;
  /** Bumped by every ⌘F / ⌘⌥F, so the bar takes the keyboard even when already open. */
  focusRequest: number;
  toggleReplace: () => void;
  replacement: string;
  setReplacement: (r: string) => void;
  replace: () => void;
  replaceAll: () => void;
  /** How many the last Replace All changed; cleared by the next find action. */
  replaced: number | null;
}

// The open editor, so replace is one undoable edit. Before the editor has
// mounted (it attaches asynchronously) the edit goes straight to the note text.
function editTarget(): ReplaceTarget {
  const view = getEditorView();
  if (view) return view;
  let state = EditorState.create({ doc: useStore.getState().content });
  return {
    get state() {
      return state;
    },
    dispatch(spec) {
      state = state.update(spec).state;
      useStore.getState().setContent(state.doc.toString());
    },
  };
}

// In-note find and replace. Matches come from the source text (the same string
// the editor holds). The current match is selected in the editor when one is
// mounted.
export function useFind(): FindController {
  const [query, setQueryState] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [replaced, setReplaced] = useState<number | null>(null);
  const [current, setCurrent] = useState(-1);
  const [count, setCount] = useState(0);
  const content = useStore((s) => s.content);
  const active = useActivePanel() === "find";
  const replaceOpen = useSyncExternalStore(subscribeFindMode, getReplaceOpen);
  const focusRequest = useSyncExternalStore(subscribeFindMode, getFocusRequest);

  useEffect(() => {
    if (!active || !query) {
      setCount(0);
      return;
    }
    const matches = findMatches(content, query, { caseSensitive });
    setCount(matches.length);
    if (matches.length === 0) return;
    const idx = current >= 0 && current < matches.length ? current : 0;
    if (idx !== current) setCurrent(idx);
    const match = matches[idx];
    const view = getEditorView();
    if (!view || !match) return;
    view.dispatch({
      selection: { anchor: match.start, head: match.end },
      scrollIntoView: true,
    });
  }, [active, query, caseSensitive, content, current]);

  return {
    query,
    setQuery: (q) => {
      setQueryState(q);
      setCurrent(0);
      setReplaced(null);
    },
    caseSensitive,
    toggleCaseSensitive: () => {
      setCaseSensitive((c) => !c);
      setCurrent(0);
      setReplaced(null);
    },
    count,
    current: count === 0 ? -1 : current,
    next: () => {
      setReplaced(null);
      if (count > 0) setCurrent((c) => (c + 1) % count);
    },
    prev: () => {
      setReplaced(null);
      if (count > 0) setCurrent((c) => (c - 1 + count) % count);
    },
    close: () => {
      void registry.runCommand("find.close");
      setQueryState("");
      setReplaced(null);
      setCurrent(-1);
    },
    replaceOpen,
    focusRequest,
    toggleReplace: () => setReplaceOpen(!replaceOpen),
    replacement,
    setReplacement,
    replace: () => {
      if (count === 0) return;
      setReplaced(null);
      setCurrent(replaceOne(editTarget(), query, replacement, { caseSensitive }, current));
    },
    replaceAll: () => {
      if (count === 0) return;
      setReplaced(replaceAll(editTarget(), query, replacement, { caseSensitive }));
      setCurrent(0);
    },
    replaced,
  };
}
