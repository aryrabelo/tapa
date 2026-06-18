import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { useStore } from "@/state/store";

// Reloads the active file when it changes on disk (Rust `file-changed` event):
// silently if clean, with a keep/reload prompt if there are unsaved edits.
// Defensive against a missing Tauri runtime (plain-browser QA).
export function useFileWatcher(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const reload = async () => {
      const { root, activePath } = useStore.getState();
      if (!root || !activePath) return;
      try {
        const c = await readFile(`${root}/${activePath}`);
        useStore.getState().setActive(activePath, c);
      } catch (e) {
        toast.error(String(e));
      }
    };

    const matchesActive = (paths: string[]): boolean => {
      const { root, activePath } = useStore.getState();
      if (!root || !activePath) return false;
      const normalize = (p: string): string => p.replace(/\\/g, "/");
      const absNorm = normalize(`${root}/${activePath}`);
      return paths.some((p) => normalize(p) === absNorm);
    };

    try {
      listen<string[]>("file-changed", (ev) => {
        if (!matchesActive(ev.payload)) return;
        if (useStore.getState().dirty) {
          toast.warning("This file changed on disk.", {
            description: "You have unsaved edits.",
            action: { label: "Reload (discard mine)", onClick: () => void reload() },
            cancel: { label: "Keep mine", onClick: () => undefined },
          });
          return;
        }
        void reload();
      })
        .then((un) => {
          if (cancelled) un();
          else unlisten = un;
        })
        .catch(() => {});
    } catch {
      // Tauri runtime unavailable (sync throw): live reload disabled.
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
