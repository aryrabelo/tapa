import type * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

// Presentational in-document find bar pinned to the top-right of the reader.
// All state lives in useFind; this only renders and reports intent, so it is
// testable without the DOM-walking highlight machinery.
export function FindBar({
  query,
  onQueryChange,
  count,
  current,
  onNext,
  onPrev,
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  count: number;
  current: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}): React.ReactElement {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const counter = count === 0 ? (query ? "No results" : "") : `${current + 1}/${count}`;

  return (
    <div className="absolute right-4 top-2 z-50 flex items-center gap-1 rounded-lg border bg-popover px-2 py-1 text-popover-foreground shadow-md">
      <Input
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder="Find in file"
        className="h-7 w-48"
      />
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
        {counter}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Previous match"
        disabled={count === 0}
        onClick={onPrev}
      >
        <ChevronDown className="size-4 rotate-180" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Next match"
        disabled={count === 0}
        onClick={onNext}
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Close find"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
