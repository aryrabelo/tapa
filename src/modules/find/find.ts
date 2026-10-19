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
// empty/whitespace-only needle, or one longer than the haystack, yields none.
// Lowercasing each side once (two strings total) keeps the scan
// allocation-light; the search step advances past each hit so matches never
// overlap.
export function findMatches(
  haystack: string,
  needle: string,
  { caseSensitive = false }: FindOptions = {},
): FindMatch[] {
  if (!needle.trim() || needle.length > haystack.length) return [];
  const hay = caseSensitive ? haystack : haystack.toLowerCase();
  const nee = caseSensitive ? needle : needle.toLowerCase();
  const matches: FindMatch[] = [];
  for (let i = hay.indexOf(nee); i !== -1; i = hay.indexOf(nee, i + nee.length)) {
    matches.push({ start: i, end: i + nee.length });
  }
  return matches;
}
