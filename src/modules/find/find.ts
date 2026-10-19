export interface FindMatch {
  start: number;
  end: number;
}

export interface FindOptions {
  /** Match upper/lower case exactly. Off by default. */
  caseSensitive?: boolean;
}

// All non-overlapping occurrences of `needle` in `haystack`, as half-open
// [start, end) char ranges; case-insensitive unless `caseSensitive`. An
// empty/whitespace-only needle yields none. Matching runs on the original
// text (a case-insensitive RegExp, not lowercased copies), because
// lowercasing can change the length ("İ" becomes two chars) and shift every
// offset after it, so Replace would edit the wrong text.
export function findMatches(
  haystack: string,
  needle: string,
  { caseSensitive = false }: FindOptions = {},
): FindMatch[] {
  if (!needle.trim()) return [];
  const escaped = needle.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
  const re = new RegExp(escaped, caseSensitive ? "gu" : "giu");
  const matches: FindMatch[] = [];
  for (const m of haystack.matchAll(re)) {
    matches.push({ start: m.index, end: m.index + m[0].length });
  }
  return matches;
}
