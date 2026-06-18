import type * as React from "react";
import { useMemo } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SearchHit } from "@/lib/tauri";

const RENDER_CAP = 100;

// Presentational content-search overlay. Data (hits) is fed in by App; the
// panel only renders and reports selection, so it is testable without Tauri.
export function SearchPanel({
  open,
  hits,
  query,
  onQueryChange,
  onPick,
  onClose,
}: {
  open: boolean;
  hits: SearchHit[];
  query: string;
  onQueryChange?: (q: string) => void;
  onPick: (hit: SearchHit) => void;
  onClose: () => void;
}): React.ReactElement {
  const groups = useMemo(() => {
    const byFile = new Map<string, SearchHit[]>();
    for (const h of hits.slice(0, RENDER_CAP)) {
      const arr = byFile.get(h.path) ?? [];
      arr.push(h);
      byFile.set(h.path, arr);
    }
    return [...byFile.entries()];
  }, [hits]);

  const total = hits.length;
  const summary =
    total === 0
      ? null
      : `${total}${total > RENDER_CAP ? "+" : ""} matches in ${groups.length} files`;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Search in files"
      description="Search file contents"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search file contents…"
          value={query}
          onValueChange={onQueryChange}
        />
        {summary && <div className="px-3 py-1 text-xs text-muted-foreground">{summary}</div>}
        <CommandList>
          <CommandEmpty>{query ? "No matches." : "Type to search."}</CommandEmpty>
          {groups.map(([path, fileHits]) => (
            <CommandGroup key={path} heading={`${path}  (${fileHits.length})`}>
              {fileHits.map((h) => (
                <CommandItem
                  key={`${h.path}:${h.line}:${h.col}`}
                  value={`${h.path}:${h.line}:${h.col}`}
                  onSelect={() => onPick(h)}
                >
                  <span className="mr-2 tabular-nums text-muted-foreground">{h.line}</span>
                  <Highlight text={h.snippet} query={query} />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// Highlights the first case-insensitive occurrence of `query` in `text`.
function Highlight({ text, query }: { text: string; query: string }): React.ReactElement {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-foreground">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </span>
  );
}
