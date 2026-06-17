import type * as React from "react";
import { Suspense, lazy, useEffect, useState } from "react";

// The fuzzy file finder pulls in cmdk + the radix Dialog (~18KB gzip). It is
// hidden until ⌘K, so the dialog body is loaded on first open instead of at
// startup — this thin wrapper only owns the open state and the ⌘K listener.
const PaletteDialog = lazy(() =>
  import("./PaletteDialog").then((m) => ({ default: m.PaletteDialog })),
);

export function CommandPalette({
  files,
  onPick,
}: {
  files: string[];
  onPick: (path: string) => void;
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <PaletteDialog files={files} onPick={onPick} open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
