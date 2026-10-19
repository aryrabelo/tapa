import type * as React from "react";
import { Suspense, lazy } from "react";
import { useStore } from "@/state/store";

// The fuzzy file finder pulls in cmdk + the radix Dialog (~18KB gzip). It is
// hidden until the first "Go to File…" (⌘K, a native menu accelerator), so the
// dialog body loads on first open; this thin wrapper only reads the store flag.
const PaletteDialog = lazy(() =>
  import("./PaletteDialog").then((m) => ({ default: m.PaletteDialog })),
);

let loaded = false;

export function CommandPalette({
  files,
  onPick,
  onOpenPath,
}: {
  files: string[];
  onPick: (path: string) => void;
  onOpenPath: (path: string) => void;
}): React.ReactElement | null {
  const open = useStore((s) => s.paletteOpen);
  if (open) loaded = true;
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <PaletteDialog
        files={files}
        onPick={onPick}
        onOpenPath={onOpenPath}
        open={open}
        onOpenChange={useStore.getState().setPaletteOpen}
      />
    </Suspense>
  );
}
