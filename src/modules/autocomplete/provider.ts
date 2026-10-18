// Pure suggestion logic. Given the text of the user's notes and what is typed
// before the caret on the current line, return the rest of the word and of its
// sentence as it already appears somewhere in the notes. No I/O here.

const W = "\\p{L}\\p{M}\\p{N}_";
const WORD_CHAR = new RegExp(`[${W}]`, "u");
// Rest of the word being typed. May cross an inner hyphen or apostrophe ("bem-vindo").
const WORD_REST = new RegExp(`^(?:[-'’]?[${W}]+)+`, "u");
const SENTENCE_END = /[.!?…]\s+/g;
// Terminal punctuation, with any closing quote or bracket, followed by whitespace or
// the end of the line: "3.5" goes on, "largo." ends. Abbreviations ("Sr. Silva") end
// it too; telling them apart would need a dictionary.
const SENTENCE_STOP = /[.!?…]+["'”’»)\]]*(?=\s|$)/u;
const LINE_BREAK = /[\r\n]/;
/** Longest suggestion in UTF-16 units, the finished word included. */
export const MAX_SUGGESTION = 120;

/** Typed context below this length never triggers a lookup. */
export const MIN_CONTEXT = 3;
/** How many trailing words of the sentence the longest lookup uses. */
const MAX_QUERY_WORDS = 5;
/** Occurrences tallied per lookup, so a common prefix stays cheap. */
const MAX_HITS = 64;
// Text read after each hit. Larger than MAX_SUGGESTION, so a sentence the window cuts
// short is always capped rather than mistaken for a finished one.
const TAIL_WINDOW = 200;

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && WORD_CHAR.test(ch);

/**
 * Lookups to try for `before` (the line up to the caret), longest first. Each
 * starts at a word start inside the current sentence and ends at the caret.
 * Empty when the caret is not right after a word character.
 */
export function queriesFor(before: string): string[] {
  if (!isWordChar(before.at(-1))) return [];
  let from = 0;
  for (const m of before.matchAll(SENTENCE_END)) from = (m.index ?? 0) + m[0].length;
  const sentence = before.slice(from);
  const starts: number[] = [];
  for (let i = 0; i < sentence.length; i++) {
    if (isWordChar(sentence[i]) && !isWordChar(sentence[i - 1])) starts.push(i);
  }
  return starts
    .slice(-MAX_QUERY_WORDS)
    .map((i) => sentence.slice(i))
    .filter((q) => q.length >= MIN_CONTEXT);
}

interface Tally {
  count: number;
  rests: string[]; // what follows the word at each occurrence, up to the sentence end
}

/**
 * What follows a finished word up to the end of its sentence: through the terminal
 * punctuation, never past a line break, and cut back to a space when longer than
 * `room`, so the cap never splits a word.
 */
function sentenceRest(text: string, room: number): string {
  const nl = text.search(LINE_BREAK);
  const line = nl === -1 ? text : text.slice(0, nl);
  const stop = SENTENCE_STOP.exec(line);
  const rest = stop ? line.slice(0, stop.index + stop[0].length) : line.trimEnd();
  if (rest.length <= room) return rest;
  const space = rest.lastIndexOf(" ", room);
  return space > 0 ? rest.slice(0, space).trimEnd() : "";
}

/**
 * The part of `rests` every occurrence agrees on. Where they diverge, cut back to
 * the end of the last whole word, so a disagreement never suggests half a word.
 */
function agreedRest(rests: readonly string[]): string {
  const first = rests[0] ?? "";
  let n = 0;
  while (n < first.length && rests.every((r) => r[n] === first[n])) n++;
  if (rests.every((r) => r.length === n)) return first;
  for (let k = n; k > 0; k--) {
    if (isWordChar(first[k - 1]) && rests.every((r) => !isWordChar(r[k]))) {
      return first.slice(0, k);
    }
  }
  return "";
}

/** Count how each occurrence of `q` in `src` would finish the word and its sentence. */
function tallyIn(src: string, q: string, tallies: Map<string, Tally>, budget: number): number {
  let used = 0;
  let at = src.indexOf(q);
  while (at !== -1 && used < budget) {
    // The match must start at a word start, so "rio T" does not match inside "curio Tal".
    if (!isWordChar(src[at - 1])) {
      const after = src.slice(at + q.length, at + q.length + TAIL_WINDOW);
      const word = WORD_REST.exec(after)?.[0];
      if (word) {
        const rest = sentenceRest(after.slice(word.length), MAX_SUGGESTION - word.length);
        const prev = tallies.get(word);
        if (prev) {
          prev.count++;
          prev.rests.push(rest);
        } else tallies.set(word, { count: 1, rests: [rest] });
        used++;
      }
    }
    at = src.indexOf(q, at + 1);
  }
  return used;
}

function bestTail(sources: readonly string[], q: string): string | null {
  const tallies = new Map<string, Tally>();
  let budget = MAX_HITS;
  for (const src of sources) {
    if (budget <= 0) break;
    budget -= tallyIn(src, q, tallies, budget);
  }
  let best: [string, Tally] | null = null;
  // Most frequent completion wins; a tie keeps the one seen first.
  for (const entry of tallies) if (!best || entry[1].count > best[1].count) best = entry;
  if (!best) return null;
  const [word, { rests }] = best;
  return word + agreedRest(rests);
}

/**
 * The text to show after the caret, or null. Matching is case-sensitive and
 * the result always starts by finishing the current word, so accepting it
 * never changes what was already typed.
 */
export function suggest(sources: readonly string[], before: string): string | null {
  for (const q of queriesFor(before)) {
    const tail = bestTail(sources, q);
    if (tail) return tail;
  }
  return null;
}

export interface CorpusLimits {
  maxFiles: number;
  maxChars: number;
}

/**
 * Read up to `maxFiles` notes, stopping once `maxChars` UTF-16 units are in.
 * The last note is cut to fit. A note that fails to read is skipped.
 * `isStale` lets a newer folder load stop this one between reads.
 */
export async function loadNotes(
  files: readonly string[],
  read: (rel: string) => Promise<string>,
  limits: CorpusLimits,
  isStale: () => boolean,
): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  let left = limits.maxChars;
  for (const rel of files.slice(0, limits.maxFiles)) {
    if (left <= 0 || isStale()) break;
    let text: string;
    try {
      text = await read(rel);
    } catch {
      continue;
    }
    const kept = text.slice(0, left);
    notes.set(rel, kept);
    left -= kept.length;
  }
  return notes;
}
