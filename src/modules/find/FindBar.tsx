import type * as React from "react";
import { useEffect, useRef } from "react";
import { focusField, refocusEditor } from "@/lib/editor-view";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { type FindController, useFind } from "./useFind";

// The lazy chunk App renders while the "find" panel is active. Find state lives
// here, not in App, so none of it loads until ⌘F.
export function FindBar(): React.ReactElement {
  return <FindBarView {...useFind()} />;
}

// Presentational find/replace bar pinned to the top-right of the note. All
// state lives in useFind; this only renders and reports intent, so it is
// testable without an editor.
export function FindBarView(find: FindController): React.ReactElement {
  const { query, count, current, replaceOpen, focusRequest, replaced } = find;
  const box = useRef<HTMLDivElement>(null);

  // `autoFocus` only works at page load under preact/compat, so the bar would
  // open with the keyboard still in the note. Focus by hand: the find field,
  // or the replacement once Replace opens on an existing query. ⌘F / ⌘⌥F bump
  // `focusRequest`, so they take the keyboard back even when the bar is open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus only when the bar opens, Replace toggles, or ⌘F asks again, not on every keystroke.
  useEffect(() => {
    const fields = box.current?.querySelectorAll("input");
    focusField(replaceOpen && query !== "" ? fields?.[1] : fields?.[0], true);
  }, [replaceOpen, focusRequest]);

  // Closing the bar (Esc or ×) hands the keyboard back to the note.
  useEffect(() => refocusEditor, []);

  const onFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) find.prev();
      else find.next();
    } else if (e.key === "Escape") {
      e.preventDefault();
      find.close();
    }
  };

  const onReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      find.replace();
    } else if (e.key === "Escape") {
      e.preventDefault();
      find.close();
    }
  };

  const counter =
    replaced !== null
      ? `${replaced} replaced`
      : count === 0
        ? query
          ? "No results"
          : ""
        : `${current + 1}/${count}`;

  return (
    <div
      ref={box}
      className="absolute right-4 top-2 z-50 flex flex-col gap-1 rounded-lg border bg-popover px-2 py-1 text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={replaceOpen ? "Hide replace" : "Show replace"}
          aria-expanded={replaceOpen}
          onClick={find.toggleReplace}
        >
          <ChevronDown className={replaceOpen ? "size-4" : "size-4 -rotate-90"} />
        </Button>
        <Input
          value={query}
          onChange={(e) => find.setQuery(e.currentTarget.value)}
          onKeyDown={onFindKeyDown}
          placeholder="Find in file"
          className="h-7 w-48"
        />
        <Button
          size="icon"
          variant={find.caseSensitive ? "secondary" : "ghost"}
          className="size-7 text-xs"
          aria-label="Match case"
          aria-pressed={find.caseSensitive}
          title="Match case"
          onClick={find.toggleCaseSensitive}
        >
          Aa
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
          {counter}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Previous match"
          disabled={count === 0}
          onClick={find.prev}
        >
          <ChevronDown className="size-4 rotate-180" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Next match"
          disabled={count === 0}
          onClick={find.next}
        >
          <ChevronDown className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Close find"
          onClick={find.close}
        >
          <X className="size-4" />
        </Button>
      </div>
      {replaceOpen && (
        <div className="flex items-center gap-1 pl-8">
          <Input
            value={find.replacement}
            onChange={(e) => find.setReplacement(e.currentTarget.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder="Replace with"
            className="h-7 w-48"
          />
          <Button size="sm" variant="ghost" disabled={count === 0} onClick={find.replace}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" disabled={count === 0} onClick={find.replaceAll}>
            Replace All
          </Button>
        </div>
      )}
    </div>
  );
}
