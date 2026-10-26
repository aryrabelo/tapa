import type * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "@/components/ui/icons";
import { refocusEditor } from "@/lib/editor-view";
import { registry } from "@/lib/registry";
import { type PreviousVersion, previousVersion } from "@/lib/tauri";
import { useStore } from "@/state/store";
import { type Change, sentenceChanges } from "./diff";
import { SOURCE_LABEL } from "./labels";

/** Typing pauses this long before the list is recomputed. */
export const REFRESH_MS = 300;

const reviewInText = () => void registry.runCommand("changes.review");

type Result =
  | { status: "loading" }
  | { status: "none" }
  | { status: "failed" }
  | { status: "ready"; source: PreviousVersion["source"]; changes: Change[] };

/** `value`, but only after it has stopped changing for `ms`. The first value is immediate. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Compares the open note, unsaved typing included, with its previous version
 * (Git `HEAD`, or the copy Tapa kept when the note was opened) and lists the
 * sentences that came in and went out. Reads the note from the app store.
 */
export function ChangesPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const root = useStore((s) => s.root);
  const activePath = useStore((s) => s.activePath);
  const content = useSettled(
    useStore((s) => s.content),
    REFRESH_MS,
  );
  const [result, setResult] = useState<Result>({ status: "loading" });

  // The panel is not told about Escape: it listens itself, like the find bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => refocusEditor, []);

  // The earlier version is read again with every refresh: a commit made outside
  // Tapa moves the Git baseline while the note stays open.
  useEffect(() => {
    if (!root || !activePath) {
      setResult({ status: "none" });
      return;
    }
    let stale = false;
    previousVersion(`${root}/${activePath}`).then(
      (previous) => {
        if (stale) return;
        setResult(
          previous
            ? {
                status: "ready",
                source: previous.source,
                changes: sentenceChanges(previous.text, content),
              }
            : { status: "none" },
        );
      },
      () => {
        if (!stale) setResult({ status: "failed" });
      },
    );
    return () => {
      stale = true;
    };
  }, [root, activePath, content]);

  return (
    <aside
      aria-label="What changed"
      className="fixed right-4 top-12 z-50 flex max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-lg border bg-popover text-popover-foreground shadow-md"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">
          {result.status === "ready" ? SOURCE_LABEL[result.source] : "What changed"}
        </h2>
        <Button size="icon" variant="ghost" className="size-7" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </Button>
      </header>
      <div className="overflow-auto px-3 py-2 text-sm leading-relaxed">
        <Body result={result} />
      </div>
    </aside>
  );
}

function Body({ result }: { result: Result }): React.ReactElement | null {
  switch (result.status) {
    case "loading":
      return null;
    case "failed":
      return <p className="text-muted-foreground">Could not read the earlier version.</p>;
    case "none":
      return (
        <p className="text-muted-foreground">
          There is no earlier version of this note to compare with yet.
        </p>
      );
    case "ready": {
      const added = result.changes.filter((c) => c.kind === "added");
      const removed = result.changes.filter((c) => c.kind === "removed");
      if (added.length === 0 && removed.length === 0) {
        return <p className="text-muted-foreground">Nothing changed.</p>;
      }
      return (
        <div className="flex flex-col gap-3">
          <Group title="Added" tone="added" items={added} />
          <Group title="Removed" tone="removed" items={removed} />
          {/* A block wrapper keeps the button its own width; no extra CSS utility. */}
          <div>
            <Button size="sm" variant="outline" onClick={reviewInText}>
              Review in the text
            </Button>
          </div>
        </div>
      );
    }
  }
}

const TONE: Record<Change["kind"], string> = {
  added: "border-emerald-500 bg-emerald-500/10",
  removed: "border-red-500 bg-red-500/10",
};

function Group({
  title,
  tone,
  items,
}: {
  title: string;
  tone: Change["kind"];
  items: Change[];
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </h3>
      <ul className="flex flex-col gap-1">
        {items.map((c, i) => (
          // The same sentence can come in twice; its place in the list tells them apart.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable, never reordered
          <li key={`${i}:${c.text}`} className={`rounded-sm border-l-2 px-2 py-1 ${TONE[tone]}`}>
            {c.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
