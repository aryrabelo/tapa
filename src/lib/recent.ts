import { useSyncExternalStore } from "react";
import { setRecentMenu } from "@/lib/tauri";

// Recently opened files and folders (absolute paths, newest first). Kept in
// localStorage and mirrored into the native File ▸ Open Recent menu.

const KEY = "tapa-recent";
export const RECENT_LIMIT = 10;

/** Puts `path` first, drops its older copy and anything past `limit`. */
export function addRecent(list: readonly string[], path: string, limit = RECENT_LIMIT): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, limit);
}

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((p): p is string => typeof p === "string").slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

let list: string[] = typeof localStorage === "undefined" ? [] : load();
const subs = new Set<() => void>();

/** Rebuilds the native Open Recent menu. Without the Tauri runtime this does nothing. */
export function syncRecentMenu(): void {
  void Promise.resolve(list)
    .then((paths) => setRecentMenu(paths))
    .catch(() => {});
}

function commit(next: string[]): void {
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list still works for this session.
  }
  for (const cb of subs) cb();
  syncRecentMenu();
}

export function pushRecent(path: string): void {
  commit(addRecent(list, path));
}
export function removeRecent(path: string): void {
  commit(list.filter((p) => p !== path));
}
export function clearRecents(): void {
  commit([]);
}

export function useRecents(): string[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => list,
  );
}
