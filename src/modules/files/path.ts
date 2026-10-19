// Pure path helpers for the header, the window title and the recent list.
// Paths stay as the OS gave them: "/" on macOS/Linux, "\" (or "/") on Windows.

/** Splits an absolute path into its folder (with the trailing separator) and its last part. */
export function splitPath(abs: string): { dir: string; name: string } {
  const cut = Math.max(abs.lastIndexOf("/"), abs.lastIndexOf("\\"));
  return { dir: abs.slice(0, cut + 1), name: abs.slice(cut + 1) };
}

/** Replaces the home folder with "~", only at a whole folder boundary. */
export function shortenHome(abs: string, home: string | null): string {
  if (!home) return abs;
  const h = home.replace(/[\\/]+$/, "");
  if (!h || !abs.startsWith(h)) return abs;
  const rest = abs.slice(h.length);
  return rest === "" || rest[0] === "/" || rest[0] === "\\" ? `~${rest}` : abs;
}

/** Window title: "note.md — folder" (+ " — Edited"), the folder name alone, or "Tapa". */
export function windowTitle(
  root: string | null,
  activePath: string | null,
  dirty: boolean,
): string {
  if (!root) return "Tapa";
  if (!activePath) return splitPath(root.replace(/[\\/]+$/, "")).name || root;
  const { dir, name } = splitPath(`${root}/${activePath}`);
  const parent = splitPath(dir.replace(/[\\/]+$/, "")).name || dir;
  return `${name} — ${parent}${dirty ? " — Edited" : ""}`;
}
