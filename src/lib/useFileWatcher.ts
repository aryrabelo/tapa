import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { pathKind, readFile } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { openNote, rescan } from "@/modules/files/actions";
import { useStore } from "@/state/store";

// Reacts to the Rust `file-changed` event (recursive over the vault root):
//   - reloads the active file when its disk content really changed (silently
//     if clean, with a keep/reload prompt if there are unsaved edits); Tapa's
//     own saves (autosave included) leave the disk equal to `savedContent`;
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

    // Re-reading the open note failed. Gone: say so and refresh the sidebar
    // (the path itself is skipped by `touchesTree`). Anything else: show the error.
    const onActiveReadFailed = async (root: string, activePath: string, error: unknown) => {
      const gone = await pathKind(`${root}/${activePath}`).then(
        (kind) => kind === "missing",
        () => false,
      );
      // Tapa's own rename/trash already moved on from this path.
      const s = useStore.getState();
      if (s.root !== root || s.activePath !== activePath) return;
      if (!gone) {
        toast.error(String(error));
        return;
      }
      toast.warning(`“${activePath.split("/").pop()}” was moved or deleted.`, {
        description: "Your text is still open here.",
      });
      await rescanTree();
    };

    // The active file changed on disk. Unchanged content (our own write) is a no-op.
    const onActiveChanged = async () => {
      const { root, activePath } = useStore.getState();
      if (!root || !activePath) return;
      let disk: string;
      try {
        disk = await readFile(`${root}/${activePath}`);
      } catch (e) {
        await onActiveReadFailed(root, activePath, e);
        return;
      }
      const s = useStore.getState();
      if (s.activePath !== activePath || disk === s.savedContent) return;
      if (s.dirty) {
        toast.warning("This file changed on disk.", {
          description: "You have unsaved edits.",
          action: { label: "Reload (discard mine)", onClick: () => void reload() },
          cancel: { label: "Keep mine", onClick: () => undefined },
        });
      } else {
        s.setActive(activePath, disk);
      }
    };

    const matchesActive = (paths: string[]): boolean => {
      const { root, activePath } = useStore.getState();
      if (!root || !activePath) return false;
      const absNorm = normalize(`${root}/${activePath}`);
      return paths.some((p) => normalize(p) === absNorm);
    };

    // True unless every changed path IS the active file or a save's temp file
    // (`.tapa-tmp.*`, see src-tauri/src/atomic_write.rs) — avoids rescan storms
    // while editing/saving the open file.
    const touchesTree = (paths: string[]): boolean => {
      const { root, activePath } = useStore.getState();
      if (!root || paths.length === 0) return false;
      const absActive = activePath ? normalize(`${root}/${activePath}`) : null;
      return paths.some((p) => {
        const n = normalize(p);
        return n !== absActive && !n.split("/").pop()?.startsWith(".tapa-tmp.");
      });
    };

    // Keeps the mode: a single-file session stays on its file.
    const rescanTree = async () => {
      const { root } = useStore.getState();
      if (!root) return;
      try {
        await rescan(root);
      } catch {
        // Unreadable folder: the next change retries.
      }
    };

    // Read `<root>/.tapa/control.json`; on a `focus` action, refresh the tree (so
    // a just-created file shows) and open the requested vault-relative path the
    // same guarded way as a click in the sidebar.
    const handleFocus = async () => {
      const { root } = useStore.getState();
      if (!root) return;
      try {
        const raw = await readFile(`${root}/.tapa/control.json`);
        const ctrl = JSON.parse(raw) as { action?: string; path?: string };
        if (ctrl.action !== "focus" || typeof ctrl.path !== "string") return;
        await rescanTree();
        await openNote(ctrl.path);
      } catch {
        // Missing/corrupt control file: ignore.
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

        if (matchesActive(paths)) void onActiveChanged();

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
