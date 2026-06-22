import type * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
} from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSidebarActions } from "@/lib/registry";
import type { FileNode } from "@/lib/tree";
import { cn } from "@/lib/utils";

function Node({
  node,
  active,
  onPick,
  depth,
}: {
  node: FileNode;
  active: string | null;
  onPick: (p: string) => void;
  depth: number;
}): React.ReactElement {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: 8 + depth * 12 };
  if (node.kind === "dir") {
    return (
      <div>
        <button
          type="button"
          style={pad}
          className="flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-[0.8rem] text-muted-foreground hover:bg-accent/70"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          )}
          {open ? (
            <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <Folder size={14} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children?.map((c) => (
            <Node key={c.path} node={c} active={active} onPick={onPick} depth={depth + 1} />
          ))}
      </div>
    );
  }
  return (
    <button
      type="button"
      style={pad}
      onClick={() => onPick(node.path)}
      className={cn(
        "relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-[0.8rem] hover:bg-accent/70",
        active === node.path &&
          "bg-accent font-medium before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-link before:content-['']",
      )}
    >
      <FileText size={14} className="shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function AppSidebar({
  tree,
  active,
  onPick,
  onNewFile,
  onCreate,
}: {
  tree: FileNode[];
  active: string | null;
  onPick: (p: string) => void;
  onNewFile: () => void;
  onCreate: (rel: string, dir: boolean) => void;
}): React.ReactElement {
  const actions = useSidebarActions();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  // ponytail: one input for both kinds. A trailing "/" means a folder; nested
  // paths create intermediate dirs. A file with no extension gets ".md".
  function submit() {
    const raw = name.trim();
    const dir = raw.endsWith("/");
    let rel = raw.replace(/\/+$/, "");
    if (!dir && rel) {
      const base = rel.split("/").pop() ?? rel;
      if (!base.includes(".")) rel += ".md";
    }
    setName("");
    setCreating(false);
    if (rel) onCreate(rel, dir);
  }
  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="New file"
          title="New file (⌘N)"
          onClick={onNewFile}
        >
          <FilePlus className="size-4" />
        </Button>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.id}
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={a.label}
              title={a.label}
              onClick={a.run}
            >
              <Icon className="size-4" />
            </Button>
          );
        })}
      </div>
      {tree.length > 0 ? (
        <>
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Files
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 text-muted-foreground"
              aria-label="New file or folder"
              title="New file or folder — end the name with / for a folder"
              onClick={() => setCreating((v) => !v)}
            >
              <span aria-hidden className="text-base leading-none">
                +
              </span>
            </Button>
          </div>
          {creating && (
            <div className="px-2 pb-1">
              <input
                // biome-ignore lint/a11y/noAutofocus: the input only mounts on an explicit "+" click
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  else if (e.key === "Escape") {
                    setName("");
                    setCreating(false);
                  }
                }}
                onBlur={() => {
                  setName("");
                  setCreating(false);
                }}
                placeholder="name.md — end with / for a folder"
                aria-label="New entry name"
                className="w-full rounded-md border bg-background px-2 py-1 text-[0.8rem] outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-1 pb-2">
              {tree.map((n) => (
                <Node key={n.path} node={n} active={active} onPick={onPick} depth={0} />
              ))}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No folder open. Use New file, open a tool above, or ⌘K.
        </div>
      )}
    </div>
  );
}
