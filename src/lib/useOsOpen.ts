import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { takePendingOpen } from "@/lib/tauri";

// Opens files handed over by the OS (file association / `open file.md`): drains
// the buffer captured before mount, then listens for opens while running.
// Defensive against a missing Tauri runtime (plain-browser QA).
export function useOsOpen(openFileByPath: (file: string) => Promise<void>): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void takePendingOpen()
      .then((paths) => {
        if (paths[0]) void openFileByPath(paths[0]);
      })
      .catch(() => {});

    try {
      listen<string[]>("open-files", (ev) => {
        if (ev.payload?.[0]) void openFileByPath(ev.payload[0]);
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
  }, [openFileByPath]);
}
