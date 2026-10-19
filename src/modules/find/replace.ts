import { isolateHistory } from "@codemirror/commands";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import { type FindOptions, findMatches } from "./find";

/** What replace edits: the open EditorView, or anything shaped like it. */
export interface ReplaceTarget {
  readonly state: EditorState;
  dispatch(spec: TransactionSpec): void;
}

/**
 * Replaces every match in one transaction, kept apart in the undo history so a
 * single undo brings them all back. Returns how many were replaced.
 */
export function replaceAll(
  target: ReplaceTarget,
  query: string,
  replacement: string,
  opts: FindOptions,
): number {
  const matches = findMatches(target.state.doc.toString(), query, opts);
  if (matches.length === 0) return 0;
  target.dispatch({
    changes: matches.map((m) => ({ from: m.start, to: m.end, insert: replacement })),
    userEvent: "input.replace.all",
    annotations: isolateHistory.of("full"),
  });
  return matches.length;
}

/**
 * Replaces match `index` and returns the index of the match after it in the
 * new text (wrapping to the first), or -1 when none are left. Counting from
 * the end of the inserted text means a replacement that contains the query
 * is not matched again.
 */
export function replaceOne(
  target: ReplaceTarget,
  query: string,
  replacement: string,
  opts: FindOptions,
  index: number,
): number {
  const match = findMatches(target.state.doc.toString(), query, opts)[index];
  if (!match) return -1;
  target.dispatch({
    changes: { from: match.start, to: match.end, insert: replacement },
    userEvent: "input.replace",
  });
  const after = match.start + replacement.length;
  const left = findMatches(target.state.doc.toString(), query, opts);
  if (left.length === 0) return -1;
  const next = left.findIndex((m) => m.start >= after);
  return next === -1 ? 0 : next;
}
