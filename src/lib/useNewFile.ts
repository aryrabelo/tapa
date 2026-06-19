import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

// Listens for the native "New File" menu item (emits "menu:new-file") and runs
// the supplied handler. Defensive against a missing Tauri runtime (browser QA).
export function useNewFile(onNewFile: () => void | Promise<void>): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    try {
      listen("menu:new-file", () => {
        void onNewFile();
      })
        .then((un) => {
          if (cancelled) un();
          else unlisten = un;
        })
        .catch(() => {});
    } catch {
      // Tauri runtime unavailable (sync throw): menu actions disabled.
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onNewFile]);
}
