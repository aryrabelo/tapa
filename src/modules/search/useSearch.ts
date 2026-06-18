import { useEffect, useState } from "react";
import { registry } from "@/lib/registry";
import { searchContent, type SearchHit } from "@/lib/tauri";
import { useStore } from "@/state/store";

const RESULT_CAP = 100;

export interface SearchController {
  hits: SearchHit[];
  query: string;
  setQuery: (q: string) => void;
  pick: (hit: SearchHit) => Promise<void>;
  close: () => void;
}

// Owns content-search state so App stays thin: a debounced (150ms) streaming
// query against the open root, and opening a hit (load the file, then ask the
// reader to scroll to the line). A superseded query drops its in-flight hits
// (alive flag) and lets the prior Channel be GC'd, stopping the Rust walk.
export function useSearch(openFile: (rel: string) => Promise<void>): SearchController {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const { root } = useStore.getState();
    if (!root || !query) {
      setHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      setHits([]);
      void searchContent(root, query, { regex: false }, (hit) => {
        if (alive) setHits((prev) => (prev.length >= RESULT_CAP ? prev : [...prev, hit]));
      });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const reset = () => {
    setQuery("");
    setHits([]);
  };

  return {
    hits,
    query,
    setQuery,
    pick: async (hit) => {
      await openFile(hit.path);
      useStore.getState().setScrollLine(hit.line);
      void registry.runCommand("search.close");
      reset();
    },
    close: () => {
      void registry.runCommand("search.close");
      reset();
    },
  };
}
