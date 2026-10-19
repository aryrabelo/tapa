// Note text size (View > Bigger/Smaller Text). The size is a percentage kept
// in localStorage and exposed as `--text-zoom` on :root; the editor theme
// multiplies its font sizes by it. Only the note text scales, not the sidebar
// or bars. No imports, so main.tsx can apply it before the first paint.
const STORAGE_KEY = "tapa-text-zoom";
export const MIN_ZOOM = 80;
export const MAX_ZOOM = 200;
export const ZOOM_STEP = 10;

/** The saved size in percent; 100 when unset or not a valid step. */
export function getZoom(): number {
  const n = typeof localStorage === "undefined" ? 100 : Number(localStorage.getItem(STORAGE_KEY));
  return Number.isInteger(n) && n >= MIN_ZOOM && n <= MAX_ZOOM && n % ZOOM_STEP === 0 ? n : 100;
}

/** Puts a size (in percent) on :root as `--text-zoom`. */
export function applyZoom(percent: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--text-zoom", String(percent / 100));
}

/** Clamps to 80–200%, saves it, and applies it. Returns the size it settled on. */
export function setZoom(percent: number): number {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent / ZOOM_STEP) * ZOOM_STEP));
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, String(next));
  applyZoom(next);
  return next;
}
