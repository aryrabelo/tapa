import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/state/store";
import { focusField, refocusEditor } from "@/lib/editor-view";
import { renameNote } from "./actions";
import { splitPath } from "./path";

// Small rename box for the open note. Lazy: loaded on the first Rename….
// A plain modal, not the Radix Dialog: under preact/compat Radix's Presence
// throws on mount here and the box never appears.
export function RenameDialog(): React.ReactElement {
  const activePath = useStore((s) => s.activePath);
  // The note this box was opened for; renameNote renames whatever is active.
  const [openedFor] = useState(activePath);
  const current = splitPath(openedFor ?? "").name;
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => useStore.getState().setRenameOpen(false);

  // Another note opened (or this one closed) while the box is up: close it,
  // so Rename never applies the old name to a different note.
  useEffect(() => {
    if (activePath !== openedFor) useStore.getState().setRenameOpen(false);
  }, [activePath, openedFor]);

  // Select the name without its extension, like Finder, so the note's editor
  // cannot keep the keyboard.
  useEffect(() => {
    const dot = current.lastIndexOf(".");
    const el = input.current;
    focusField(el);
    const select = () => el?.setSelectionRange(0, dot > 0 ? dot : current.length);
    select();
    const id = setTimeout(select, 0);
    return () => clearTimeout(id);
  }, [current]);

  // Closing (Rename, Cancel, Esc) hands the keyboard back to the note.
  useEffect(() => refocusEditor, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (useStore.getState().activePath !== openedFor) return close();
    setBusy(true);
    const err = await renameNote(name);
    setBusy(false);
    if (err) setError(err);
    else close();
  }

  // Keep Tab inside the box (input → Cancel → Rename → input), so the
  // keyboard cannot wander into the sidebar or the note behind it.
  function trapTab(e: React.KeyboardEvent<HTMLFormElement>) {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("input, button:not(:disabled)"),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at + 1) % items.length;
    e.preventDefault();
    items[next]?.focus();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled on the form; the backdrop click is the mouse equivalent.
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes the box like a native sheet.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/10 pt-[20vh] supports-backdrop-filter:backdrop-blur-xs"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Rename note"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "Tab") {
            trapTab(e);
          }
        }}
        className="grid w-full max-w-sm gap-3 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      >
        <p className="font-medium" aria-hidden="true">
          Rename note
        </p>
        <input
          ref={input}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="New name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            Rename
          </Button>
        </div>
      </form>
    </div>
  );
}
