import type * as React from "react";
import { useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { fuzzyRank } from "@/lib/fuzzy";

// Heavy palette body (cmdk + radix Dialog). Lazily imported by CommandPalette
// so these modules stay out of the startup bundle until ⌘K is first pressed.
export function PaletteDialog({
  files,
  onPick,
  open,
  onOpenChange,
}: {
  files: string[];
  onPick: (path: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [q, setQ] = useState("");
  const ranked = q ? fuzzyRank(q, files) : files;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump to file"
      description="Search files by name"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder="Jump to file..." value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>No files.</CommandEmpty>
          {ranked.slice(0, 50).map((f) => (
            <CommandItem
              key={f}
              value={f}
              onSelect={() => {
                onPick(f);
                onOpenChange(false);
                setQ("");
              }}
            >
              {f}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
