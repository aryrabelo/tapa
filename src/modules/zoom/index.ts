import type { Module } from "@/lib/registry";

// Bigger/smaller note text (⌘= ⌘- ⌘0, from the native View menu). The size is
// a percentage kept in localStorage and exposed as `--text-zoom` on :root; the
// editor theme multiplies its font sizes by it. Only the note text scales, not
// the sidebar or bars.
const STORAGE_KEY = "tapa-text-zoom";
export const MIN_ZOOM = 80;
export const MAX_ZOOM = 200;
const STEP = 10;

/** The saved size in percent; 100 when unset or not a valid step. */
export function getZoom(): number {
  const n = typeof localStorage === "undefined" ? 100 : Number(localStorage.getItem(STORAGE_KEY));
  return Number.isInteger(n) && n >= MIN_ZOOM && n <= MAX_ZOOM && n % STEP === 0 ? n : 100;
}

/** Clamps to 80–200%, saves it, and applies it. Returns the size it settled on. */
export function setZoom(percent: number): number {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent / STEP) * STEP));
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, String(next));
  document.documentElement.style.setProperty("--text-zoom", String(next / 100));
  return next;
}

export const zoomModule: Module = {
  id: "zoom",
  register(reg) {
    // Runs while core plugins boot, before any note opens: the saved size is
    // on :root by the time the editor first paints.
    document.documentElement.style.setProperty("--text-zoom", String(getZoom() / 100));
    reg.command({
      id: "view.zoomIn",
      title: "Bigger text",
      run: () => void setZoom(getZoom() + STEP),
    });
    reg.command({
      id: "view.zoomOut",
      title: "Smaller text",
      run: () => void setZoom(getZoom() - STEP),
    });
    reg.command({
      id: "view.zoomReset",
      title: "Actual size",
      run: () => void setZoom(100),
    });
  },
  activate() {},
};
