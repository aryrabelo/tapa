import { useEffect, useState } from "react";
import { getEditorView } from "@/lib/editor-view";
import { registry, useActivePanel } from "@/lib/registry";
import { useStore } from "@/state/store";
import { findMatches } from "./find";

export interface FindController {
  query: string;
  setQuery: (q: string) => void;
  count: number;
  current: number; // 0-based index of the active match, -1 when there are none
  next: () => void;
  prev: () => void;
  close: () => void;
}

// In-note find. Matches come from the source text (the same string the editor
// holds). The current match is selected in the editor when one is mounted.
export function useFind(): FindController {
  const [query, setQueryState] = useState("");
  const [current, setCurrent] = useState(-1);
  const [count, setCount] = useState(0);
  const content = useStore((s) => s.content);
  const active = useActivePanel() === "find";

  useEffect(() => {
    if (!active || !query) {
      setCount(0);
      return;
    }
    const matches = findMatches(content, query);
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
  }, [active, query, content, current]);

  return {
    query,
    setQuery: (q) => {
      setQueryState(q);
      setCurrent(0);
    },
    count,
    current: count === 0 ? -1 : current,
    next: () => {
      if (count > 0) setCurrent((c) => (c + 1) % count);
    },
    prev: () => {
      if (count > 0) setCurrent((c) => (c - 1 + count) % count);
    },
    close: () => {
      void registry.runCommand("find.close");
      setQueryState("");
      setCurrent(-1);
    },
  };
}
