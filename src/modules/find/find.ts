export interface FindMatch {
  start: number;
  end: number;
}

// All non-overlapping, case-insensitive occurrences of `needle` in `haystack`,
// as half-open [start, end) char ranges. Empty/whitespace-only needle, or a
// needle longer than the haystack, yields none. Lowercasing each side once (two
// strings total) keeps the scan allocation-light; the search step advances past
// each hit so matches never overlap.
export function findMatches(haystack: string, needle: string): FindMatch[] {
  if (!needle.trim() || needle.length > haystack.length) return [];
  const hay = haystack.toLowerCase();
  const nee = needle.toLowerCase();
  const matches: FindMatch[] = [];
  for (let i = hay.indexOf(nee); i !== -1; i = hay.indexOf(nee, i + nee.length)) {
    matches.push({ start: i, end: i + nee.length });
  }
  return matches;
}
