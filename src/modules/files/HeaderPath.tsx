import { homeDir } from "@tauri-apps/api/path";
import type * as React from "react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { shortenHome, splitPath } from "./path";

let home: Promise<string | null> | null = null;

/** The user's home folder, or null without the Tauri runtime. Read once. */
export function useHome(): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    if (!home) {
      try {
        home = homeDir().catch(() => null);
      } catch {
        home = Promise.resolve(null);
      }
    }
    let live = true;
    void home.then((h) => {
      if (live) setValue(h);
    });
    return () => {
      live = false;
    };
  }, []);
  return value;
}

/**
 * Full path of the open note: folder muted, name strong. When space runs out
 * the folder loses its start (rtl ellipsis on the left), the name never
 * shrinks. Click copies the full path.
 */
export function HeaderPath({ path }: { path: string }): React.ReactElement {
  const { dir, name } = splitPath(shortenHome(path, useHome()));
  return (
    <button
      type="button"
      title={`${path} — click to copy`}
      aria-label={`${path}. Copy path`}
      onClick={() => {
        void navigator.clipboard
          .writeText(path)
          .then(() => toast.success("Path copied"))
          .catch(() => toast.error("Couldn't copy the path."));
      }}
      className="flex min-w-0 items-baseline rounded px-1 text-sm hover:bg-accent"
    >
      {/* LRM marks keep "/" and "~" at the right ends inside the rtl box. */}
      <span dir="rtl" className="min-w-0 truncate text-left text-muted-foreground">
        {`\u200E${dir}\u200E`}
      </span>
      <span className="shrink-0 font-medium text-foreground">{name}</span>
    </button>
  );
}
