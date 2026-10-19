import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState } from "react";
import { confirmAction } from "@/lib/tauri";
import { useStore } from "@/state/store";
import { autosave, openPath } from "./actions";
import { windowTitle } from "./path";

// Window-level glue: title, save-before-close and drag & drop. Each piece is a
// no-op without the Tauri runtime (plain-browser QA, tests).

/** Keeps the window title as "note.md — folder" (+ " — Edited"). Returns the unsubscribe. */
export function syncWindowTitle(): () => void {
  let last = "";
  const apply = () => {
    const { root, activePath, dirty } = useStore.getState();
    const title = windowTitle(root, activePath, dirty);
    if (title === last) return;
    last = title;
    try {
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => {});
    } catch {
      // No Tauri runtime.
    }
  };
  apply();
  return useStore.subscribe(apply);
}

/**
 * Saves the note before the window closes. If the save fails the window stays
 * open unless the user agrees to lose the edits.
 */
export function guardWindowClose(): () => void {
  let off: (() => void) | undefined;
  let cancelled = false;
  try {
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (await autosave.flush()) return;
        const close = await confirmAction(
          "Your latest changes could not be saved. Close anyway and lose them?",
          "Close Window",
          "Close Anyway",
        );
        if (!close) event.preventDefault();
      })
      .then((un) => {
        if (cancelled) un();
        else off = un;
      })
      .catch(() => {});
  } catch {
    // No Tauri runtime.
  }
  return () => {
    cancelled = true;
    off?.();
  };
}

/** Opens a dropped .md file or folder. True while something is dragged over the window. */
export function useDragDrop(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    try {
      void getCurrentWebview()
        .onDragDropEvent(({ payload }) => {
          if (payload.type === "enter" || payload.type === "over") {
            setOver(true);
            return;
          }
          setOver(false);
          if (payload.type === "drop" && payload.paths[0]) void openPath(payload.paths[0]);
        })
        .then((un) => {
          if (cancelled) un();
          else off = un;
        })
        .catch(() => {});
    } catch {
      // No Tauri runtime.
    }
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  return over;
}
