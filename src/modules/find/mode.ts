// Whether the find bar shows its replace row, and how many times ⌘F / ⌘⌥F
// asked for the keyboard. Set by `find.open` (replace off) and `find.replace`
// (on), and by the bar's own expand button. Kept outside React so the
// always-loaded commands can set it without pulling in the bar.
let replaceOpen = false;
let focusRequest = 0;
const subs = new Set<() => void>();

export function getReplaceOpen(): boolean {
  return replaceOpen;
}

export function getFocusRequest(): number {
  return focusRequest;
}

export function setReplaceOpen(open: boolean): void {
  if (open === replaceOpen) return;
  replaceOpen = open;
  for (const cb of subs) cb();
}

/** ⌘F / ⌘⌥F: set the replace row and ask the bar to take the keyboard, even when it is already open. */
export function requestFind(replace: boolean): void {
  replaceOpen = replace;
  focusRequest += 1;
  for (const cb of subs) cb();
}

export function subscribeFindMode(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
