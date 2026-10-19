import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { takePendingOpen } from "@/lib/tauri";

// Opens files handed over by the OS (file association / `open file.md`): drains
// the buffer captured before mount, then listens for opens while running. A
// launch without a file hands over to `onPlainLaunch` (session restore), whose
// signal aborts as soon as the OS hands over a file, so that file wins.
// Defensive against a missing Tauri runtime (plain-browser QA).
export function useOsOpen(
  openFileByPath: (file: string) => Promise<unknown>,
  onPlainLaunch: (signal: AbortSignal) => Promise<void>,
): void {
  // Refs survive StrictMode's effect re-run: the buffer is drained once per mount.
  const drained = useRef(false);
  const [osOpened] = useState(() => new AbortController());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    if (!drained.current) {
      drained.current = true;
      void takePendingOpen()
        .catch(() => [])
        .then((paths) => {
          if (!paths[0]) return onPlainLaunch(osOpened.signal);
          osOpened.abort();
          return openFileByPath(paths[0]);
        })
        .catch(() => {});
    }

    try {
      listen<string[]>("open-files", (ev) => {
        if (!ev.payload?.[0]) return;
        osOpened.abort();
        void openFileByPath(ev.payload[0]);
      })
        .then((un) => {
          if (cancelled) un();
          else unlisten = un;
        })
        .catch(() => {});
    } catch {
      // Tauri runtime unavailable (sync throw): OS-open disabled.
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [openFileByPath, onPlainLaunch, osOpened]);
}
