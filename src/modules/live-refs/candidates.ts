import { syntaxTree } from "@codemirror/language";
import type { EditorState, Line } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/** `[inner]` that might be a live reference. Rust decides whether it is one. */
export interface Candidate {
  /** Position of `[`. */
  from: number;
  /** Position just after `]`. */
  to: number;
  /** The text between the brackets, exactly as written. */
  text: string;
}

export const MAX_TEXTS = 200;

const BRACKETS = /\[([^[\]\n]{1,160})\]/g;
const BEFORE_BLOCKS: Record<string, true> = { "\\": true, "!": true, "[": true, "]": true };
const AFTER_BLOCKS: Record<string, true> = { "(": true, "[": true, "]": true, ":": true };
const TASK = /^[ xX]$/;

// Inside these nodes a bracket is code, markup or an address, never a reference.
const EXCLUDED: Record<string, true> = {
  InlineCode: true,
  CodeText: true,
  FencedCode: true,
  CodeBlock: true,
  HTMLBlock: true,
  HTMLTag: true,
  Comment: true,
  CommentBlock: true,
  ProcessingInstruction: true,
  URL: true,
  Autolink: true,
  LinkLabel: true,
  TaskMarker: true,
  Image: true,
};

function excluded(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (EXCLUDED[node.name]) return true;
  }
  return false;
}

function lineCandidates(state: EditorState, line: Line, out: Candidate[]): void {
  const text = line.text;
  BRACKETS.lastIndex = 0;
  for (let m = BRACKETS.exec(text); m; m = BRACKETS.exec(text)) {
    const inner = m[1];
    const before = m.index > 0 ? text[m.index - 1] : "";
    const after = text[m.index + m[0].length] ?? "";
    if (BEFORE_BLOCKS[before] || AFTER_BLOCKS[after]) continue;
    if (TASK.test(inner) || inner.trim() === "") continue;
    const from = line.from + m.index;
    if (excluded(state, from)) continue;
    out.push({ from, to: from + m[0].length, text: inner });
  }
}

/** Every candidate on the lines touching `[from, to]`, in document order. */
export function findCandidates(state: EditorState, from = 0, to = state.doc.length): Candidate[] {
  const out: Candidate[] = [];
  const doc = state.doc;
  const last = doc.lineAt(to).number;
  for (let n = doc.lineAt(from).number; n <= last; n++) lineCandidates(state, doc.line(n), out);
  return out;
}

/** Distinct texts in first-seen order, at most `MAX_TEXTS`. */
export function uniqueTexts(candidates: readonly Candidate[]): string[] {
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.size >= MAX_TEXTS) break;
    seen.add(c.text);
  }
  return [...seen];
}
