import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { readFile, scanTree } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { useStore } from "@/state/store";

// Reacts to the Rust `file-changed` event (recursive over the vault root):
//   - reloads the active file when it changes on disk (silently if clean, with a
//     keep/reload prompt if there are unsaved edits);
//   - re-scans the sidebar tree on any add/remove/change beyond the active file;
//   - honours an agent->UI `focus` signal written to `<root>/.tapa/control.json`.
// Defensive against a missing Tauri runtime (plain-browser QA).
export function useFileWatcher(): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const normalize = (p: string): string => p.replace(/\\/g, "/");

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
      const absNorm = normalize(`${root}/${activePath}`);
      return paths.some((p) => normalize(p) === absNorm);
    };

    // True unless every changed path IS the active file — avoids rescan storms
    // while editing/saving the open file.
    const touchesTree = (paths: string[]): boolean => {
      const { root, activePath } = useStore.getState();
      if (!root || paths.length === 0) return false;
      const absActive = activePath ? normalize(`${root}/${activePath}`) : null;
      return paths.some((p) => normalize(p) !== absActive);
    };

    const rescanTree = async () => {
      const { root } = useStore.getState();
      if (!root) return;
      const files = await scanTree(root);
      useStore.getState().setFolder(root, files);
    };

    // Read `<root>/.tapa/control.json`; on a `focus` action, refresh the tree (so
    // a just-created file shows) and open the requested vault-relative path.
    const handleFocus = async () => {
      const { root } = useStore.getState();
      if (!root) return;
      try {
        const raw = await readFile(`${root}/.tapa/control.json`);
        const ctrl = JSON.parse(raw) as { action?: string; path?: string };
        if (ctrl.action !== "focus" || typeof ctrl.path !== "string") return;
        await rescanTree();
        const content = await readFile(`${root}/${ctrl.path}`);
        useStore.getState().setActive(ctrl.path, content);
      } catch {
        // Missing/corrupt control file or unreadable target: ignore.
      }
    };

    try {
      listen<string[]>("file-changed", (ev) => {
        const paths = ev.payload;

        // Agent->UI focus channel takes priority and does its own tree refresh.
        if (paths.some((p) => normalize(p).endsWith("/.tapa/control.json"))) {
          void handleFocus();
          return;
        }

        if (matchesActive(paths)) {
          if (useStore.getState().dirty) {
            toast.warning("This file changed on disk.", {
              description: "You have unsaved edits.",
              action: { label: "Reload (discard mine)", onClick: () => void reload() },
              cancel: { label: "Keep mine", onClick: () => undefined },
            });
          } else {
            void reload();
          }
        }

        if (touchesTree(paths)) void rescanTree();
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
