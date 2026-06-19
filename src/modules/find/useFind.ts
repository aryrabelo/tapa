import { useEffect, useState } from "react";
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

interface TextEntry {
  node: Text;
  start: number; // cumulative char offset of this node's first char in fullText
}

// Walk the reader's text nodes once, concatenating their text and remembering
// each node's starting offset so a flat char index can be mapped back to a DOM
// position.
function collectTextNodes(container: HTMLElement): { fullText: string; nodes: TextEntry[] } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: TextEntry[] = [];
  let fullText = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    nodes.push({ node: text, start: fullText.length });
    fullText += text.data;
  }
  return { fullText, nodes };
}

// Map a flat char index to the text node containing that char and the offset
// within it. Falls back to the end of the last node for an out-of-range index.
function locate(nodes: TextEntry[], charIndex: number): { node: Text; offset: number } {
  for (const e of nodes) {
    if (charIndex < e.start + e.node.length) {
      return { node: e.node, offset: charIndex - e.start };
    }
  }
  const last = nodes[nodes.length - 1];
  return { node: last.node, offset: last.node.length };
}

// Build a DOM Range for [start, end); start and end may live in adjacent nodes.
// The end boundary is derived from the match's last char so it lands at the
// correct node/offset even at a node seam.
function buildRange(nodes: TextEntry[], start: number, end: number): Range {
  const a = locate(nodes, start);
  const b = locate(nodes, end - 1);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset + 1);
  return range;
}

// Compute the match ranges for `query` against the rendered reader text. Returns
// [] when the reader is absent or nothing matches. Pure DOM reads — no paint.
function collectRanges(query: string): Range[] {
  const container = document.querySelector<HTMLElement>("[data-reader]");
  if (!container) return [];
  const { fullText, nodes } = collectTextNodes(container);
  return findMatches(fullText, query).map((m) => buildRange(nodes, m.start, m.end));
}

// Paint via the CSS Custom Highlight API (zero DOM mutation, so it never fights
// react-markdown's reconciliation). Feature-guarded: a browser without it still
// gets counting + navigation, just no painting.
function applyHighlights(ranges: Range[], current: number): void {
  if (typeof Highlight === "undefined" || !CSS.highlights) return;
  CSS.highlights.set("tapa-find", new Highlight(...ranges));
  const cur = ranges[current];
  if (cur) CSS.highlights.set("tapa-find-current", new Highlight(cur));
}

function clearHighlights(): void {
  CSS.highlights?.delete("tapa-find");
  CSS.highlights?.delete("tapa-find-current");
}

function scrollToCurrent(ranges: Range[], current: number): void {
  const el = ranges[current]?.startContainer.parentElement;
  // scrollIntoView is undefined in jsdom; guard so tests don't throw.
  el?.scrollIntoView?.({ block: "center" });
}

// In-document find controller. Owns the query/index state and a single painting
// effect; App renders the FindBar when the "find" panel is active.
export function useFind(): FindController {
  const [query, setQueryState] = useState("");
  const [current, setCurrent] = useState(-1);
  const [count, setCount] = useState(0);
  const content = useStore((s) => s.content);
  const active = useActivePanel() === "find";

  // biome-ignore lint/correctness/useExhaustiveDependencies: `content` is an intentional repaint trigger — switching the open document changes the rendered reader text, but ranges come from the DOM, not from `content`.
  useEffect(() => {
    if (!active || !query) {
      clearHighlights();
      setCount(0);
      return;
    }
    const ranges = collectRanges(query);
    setCount(ranges.length);
    if (ranges.length === 0) {
      clearHighlights();
      return;
    }
    const idx = current >= 0 && current < ranges.length ? current : 0;
    if (idx !== current) setCurrent(idx);
    applyHighlights(ranges, idx);
    scrollToCurrent(ranges, idx);
    return clearHighlights;
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
