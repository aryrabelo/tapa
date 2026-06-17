// Returns a score (higher is better) or null if `query` is not a subsequence of `target`.
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  let score = 0;
  let ti = 0;
  let prevMatch = -2; // -2 (not -1) so the first char at index 0 is not counted contiguous
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (found === prevMatch + 1) score += 8; // contiguous
    if (found === 0 || /[/\s._-]/.test(t[found - 1])) score += 5; // start of word/segment
    score += Math.max(0, 3 - (found - ti)); // proximity to last cursor
    prevMatch = found;
    ti = found + 1;
  }
  return score - target.length * 0.05; // mild preference for shorter targets
}

export function fuzzyRank(query: string, targets: string[]): string[] {
  return targets
    .map((t) => ({ t, s: fuzzyScore(query, t) }))
    .filter((x): x is { t: string; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
}
