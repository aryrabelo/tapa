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

// An absolute path the OS can resolve directly: POSIX root ("/x"), a Windows
// drive ("C:\x" / "C:/x"), or a UNC share ("\\host\share"). Such a query never
// matches the scanned relative filenames, so the palette offers a direct open.
export function isAbsolutePath(q: string): boolean {
  return q.startsWith("/") || q.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(q);
}

// Heavy palette body (cmdk + radix Dialog). Lazily imported by CommandPalette
// so these modules stay out of the startup bundle until ⌘K is first pressed.
export function PaletteDialog({
  files,
  onPick,
  onOpenPath,
  open,
  onOpenChange,
}: {
  files: string[];
  onPick: (path: string) => void;
  onOpenPath: (path: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [q, setQ] = useState("");
  const abs = q.length > 0 && isAbsolutePath(q);
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
          {abs && (
            <CommandItem
              key="__open-path"
              value={q}
              onSelect={() => {
                onOpenPath(q);
                onOpenChange(false);
                setQ("");
              }}
            >
              Open path: {q}
            </CommandItem>
          )}
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
