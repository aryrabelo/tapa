export interface Change {
  kind: "added" | "removed";
  text: string;
}

/** Lowercase tokens (with their trailing period) that end in "." without ending a sentence. */
const ABBREVIATIONS = new Set([
  "sr.",
  "sra.",
  "srs.",
  "sras.",
  "srta.",
  "dr.",
  "dra.",
  "drs.",
  "dras.",
  "prof.",
  "profa.",
  "eng.",
  "av.",
  "ltda.",
  "cia.",
  "pág.",
  "págs.",
  "fig.",
  "vol.",
  "art.",
  "tel.",
  "obs.",
  "mr.",
  "mrs.",
  "ms.",
  "jr.",
  "st.",
  "vs.",
  "cf.",
  "inc.",
  "ltd.",
  "approx.",
  "e.g.",
  "i.e.",
  "a.m.",
  "p.m.",
  "u.s.",
]);

/** Above this many LCS cells the diff falls back to an order-insensitive multiset diff. */
const MAX_LCS_CELLS = 4_000_000;

const FENCE = /^\s*(`{3,}|~{3,})/;
const HORIZONTAL_RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const SETEXT_UNDERLINE = /^\s{0,3}=+\s*$/;
const HEADING = /^\s{0,3}#{1,6}(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const QUOTE_PREFIX = /^\s*(?:>\s?)+/;
const LIST_PREFIX = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** Private-use delimiters that park inline code while emphasis is stripped. */
const CODE_MARK = "\uE000";
const CODE_SLOT = new RegExp(`${CODE_MARK}(\\d+)${CODE_MARK}`, "g");

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Removes inline Markdown syntax, keeping the visible words. */
function stripInline(input: string): string {
  const code: string[] = [];
  const parked = input.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_m, _ticks, body: string) => {
    code.push(body);
    return `${CODE_MARK}${code.length - 1}${CODE_MARK}`;
  });
  return parked
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, "$2")
    .replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, "$1")
    .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, "$1")
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_]+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, "$1")
    .replace(CODE_SLOT, (_m, index: string) => code[Number(index)] ?? "");
}

/** Splits prose on sentence terminators, skipping known abbreviations. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?…]+["'”’)\]»]*(?=\s)/g)) {
    const end = match.index + match[0].length;
    const token = text.slice(start, end).split(/\s+/).pop()?.toLowerCase() ?? "";
    if (ABBREVIATIONS.has(token)) continue;
    out.push(text.slice(start, end));
    start = end;
  }
  out.push(text.slice(start));
  return out;
}

function isTableSeparator(line: string): boolean {
  return line.includes("|") && line.includes("-") && TABLE_SEPARATOR.test(line);
}

function tableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/);
}

/** Index of the first line after a leading `---` frontmatter block, or 0 when there is none. */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  const close = lines.findIndex((line, n) => n > 0 && /^(---|\.\.\.)\s*$/.test(line));
  return close > 0 ? close + 1 : 0;
}

/** Walks a Markdown document line by line, collecting its sentence units. */
class UnitCollector {
  readonly units: string[] = [];
  private paragraph: string[] = [];
  private fence: string | null = null;
  private inTable = false;

  feed(line: string, next: string | undefined): void {
    if (this.fence !== null) {
      this.feedFence(line);
      return;
    }
    const opening = FENCE.exec(line);
    if (opening) {
      this.openFence(opening[1]);
    } else if (line.trim() === "") {
      this.endBlock();
    } else if (!this.feedTable(line, next)) {
      this.feedBlock(line);
    }
  }

  private feedBlock(line: string): void {
    const heading = HEADING.exec(line);
    if (HORIZONTAL_RULE.test(line) || SETEXT_UNDERLINE.test(line)) {
      this.flush();
    } else if (heading) {
      this.flush();
      this.addProse(stripInline(heading[1] ?? ""));
    } else {
      this.feedProse(line);
    }
  }

  finish(): string[] {
    this.flush();
    return this.units;
  }

  private addProse(text: string): void {
    for (const sentence of splitSentences(normalize(text))) {
      this.addUnit(sentence);
    }
  }

  private addUnit(text: string): void {
    const unit = normalize(text);
    if (/[\p{L}\p{N}]/u.test(unit)) this.units.push(unit);
  }

  private flush(): void {
    if (this.paragraph.length > 0) this.addProse(stripInline(this.paragraph.join(" ")));
    this.paragraph = [];
  }

  private endBlock(): void {
    this.flush();
    this.inTable = false;
  }

  private openFence(marker: string): void {
    this.endBlock();
    this.fence = marker;
  }

  private feedFence(line: string): void {
    const closing = FENCE.exec(line);
    const open = this.fence ?? "";
    if (closing && closing[1][0] === open[0] && closing[1].length >= open.length) {
      this.fence = null;
      return;
    }
    this.addUnit(line);
  }

  /** Consumes the line when it is part of a table; returns whether it did. */
  private feedTable(line: string, next: string | undefined): boolean {
    const startsTable = line.includes("|") && next !== undefined && isTableSeparator(next);
    if (!(this.inTable || startsTable)) return false;
    if (!line.includes("|")) {
      this.inTable = false;
      return false;
    }
    this.flush();
    this.inTable = true;
    if (!isTableSeparator(line)) {
      for (const cell of tableCells(line)) this.addProse(stripInline(cell));
    }
    return true;
  }

  private feedProse(line: string): void {
    const content = line.replace(QUOTE_PREFIX, "");
    if (LIST_PREFIX.test(content)) {
      this.flush();
      this.paragraph.push(content.replace(LIST_PREFIX, ""));
    } else {
      this.paragraph.push(content);
    }
  }
}

/** Reduces a Markdown document to its ordered, whitespace-normalized sentence units. */
function toUnits(markdown: string): string[] {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const collector = new UnitCollector();
  for (let i = bodyStart(lines); i < lines.length; i++) {
    collector.feed(lines[i], lines[i + 1]);
  }
  return collector.finish();
}

interface Op {
  kind: "same" | "added" | "removed";
  text: string;
}

/** Ordered edit script between two unit sequences. */
function diffUnits(before: string[], after: string[]): Op[] {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  const a = before.slice(head, before.length - tail);
  const b = after.slice(head, after.length - tail);

  if (a.length * b.length > MAX_LCS_CELLS) {
    return [
      ...a.map((text): Op => ({ kind: "removed", text })),
      ...b.map((text): Op => ({ kind: "added", text })),
    ];
  }
  return lcsScript(a, b);
}

function lcsScript(a: string[], b: string[]): Op[] {
  // lcs[i * width + j] = LCS length of a[i..] and b[j..]
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      ops.push({ kind: "removed", text: a[i++] });
    } else {
      ops.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < a.length) ops.push({ kind: "removed", text: a[i++] });
  while (j < b.length) ops.push({ kind: "added", text: b[j++] });
  return ops;
}

/** How many times each text was both removed and added (a move, not a change). */
function movedCounts(ops: Op[]): Map<string, number> {
  const removed = new Map<string, number>();
  const added = new Map<string, number>();
  for (const op of ops) {
    const tally = op.kind === "removed" ? removed : op.kind === "added" ? added : null;
    tally?.set(op.text, (tally.get(op.text) ?? 0) + 1);
  }
  const moved = new Map<string, number>();
  for (const [text, count] of removed) {
    const matches = Math.min(count, added.get(text) ?? 0);
    if (matches > 0) moved.set(text, matches);
  }
  return moved;
}

/**
 * Sentences added to / removed from `before` to reach `after`, in document order.
 * Markdown syntax is ignored; a sentence that merely moved is not a change.
 */
export function sentenceChanges(before: string, after: string): Change[] {
  const ops = diffUnits(toUnits(before), toUnits(after));
  const moved = movedCounts(ops);
  const skippedRemoved = new Map<string, number>();
  const skippedAdded = new Map<string, number>();
  const changes: Change[] = [];
  for (const op of ops) {
    if (op.kind === "same") continue;
    const skipped = op.kind === "removed" ? skippedRemoved : skippedAdded;
    const used = skipped.get(op.text) ?? 0;
    if (used < (moved.get(op.text) ?? 0)) {
      skipped.set(op.text, used + 1);
    } else {
      changes.push({ kind: op.kind, text: op.text });
    }
  }
  return changes;
}
