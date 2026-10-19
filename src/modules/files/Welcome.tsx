import type * as React from "react";
import { Button } from "@/components/ui/button";
import { FileText, Folder } from "@/components/ui/icons";
import { useRecents } from "@/lib/recent";
import { openFileDialog, openFolderDialog, openPath } from "./actions";
import { useHome } from "./HeaderPath";
import { shortenHome, splitPath } from "./path";

// First screen: open a note or a folder, or pick up a recent one.
export function Welcome(): React.ReactElement {
  const recent = useRecents();
  const home = useHome();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="font-serif text-4xl tracking-tight text-muted-foreground">Tapa</span>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Open a note, or a folder of notes.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void openFileDialog()}>
          Open File…
        </Button>
        <Button size="sm" variant="outline" onClick={() => void openFolderDialog()}>
          Open Folder…
        </Button>
      </div>
      {recent.length > 0 && (
        <nav aria-label="Recent" className="mt-2 w-full max-w-sm text-left">
          <h2 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent
          </h2>
          <ul>
            {recent.map((p) => {
              const { dir, name } = splitPath(shortenHome(p.replace(/[\\/]+$/, ""), home));
              const Icon = /\.(md|markdown)$/i.test(name) ? FileText : Folder;
              return (
                <li key={p}>
                  <button
                    type="button"
                    title={p}
                    onClick={() => void openPath(p)}
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{dir}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
