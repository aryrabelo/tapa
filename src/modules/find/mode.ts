// Whether the find bar shows its replace row. Set by `find.open` (off) and
// `find.replace` (on), and by the bar's own expand button. Kept outside React
// so the always-loaded commands can set it without pulling in the bar.
let replaceOpen = false;
const subs = new Set<() => void>();

export function getReplaceOpen(): boolean {
  return replaceOpen;
}

export function setReplaceOpen(open: boolean): void {
  if (open === replaceOpen) return;
  replaceOpen = open;
  for (const cb of subs) cb();
}

export function subscribeReplaceOpen(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
