import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Owns ALL editor appearance for the CodeMirror live-preview mode.
 *
 * Two jobs:
 *  1. Style the live-preview decoration classes (cm-strong / cm-em /
 *     cm-inline-code / cm-link, the cm-h1..cm-h6 / cm-blockquote /
 *     cm-code-block line classes, and the cm-hr widget) so hidden-marker
 *     markdown reads as formatted text.
 *  2. Reproduce the reader's typography (serif body, heading scale, code,
 *     quotes, links) so entering edit mode looks like the rendered reader.
 *
 * It references only the app CSS vars: --foreground, --muted-foreground,
 * --muted, --ring, --border, --link. Editor.tsx no longer carries its own
 * theme block — this extension is the single source of editor styling.
 */

const SERIF = "'Newsreader Variable', ui-serif, Georgia, serif";
const MONO = 'ui-monospace, "SF Mono", "Menlo", monospace';

export const livePreviewTheme: Extension = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-content": {
    maxWidth: "680px",
    margin: "0 auto",
    padding: "2rem",
    fontFamily: SERIF,
    fontSize: "1.125rem",
    lineHeight: "1.75",
    caretColor: "var(--foreground)",
  },

  // Caret + selection
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--ring) 35%, transparent)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },

  // Inline marks
  ".cm-strong": { fontWeight: "600" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-inline-code": {
    fontFamily: MONO,
    fontSize: "0.85em",
    backgroundColor: "var(--muted)",
    borderRadius: "0.25rem",
    padding: "0.05rem 0.35rem",
  },
  ".cm-link": {
    color: "var(--link)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    textDecorationColor: "color-mix(in oklch, var(--link) 40%, transparent)",
  },

  // Headings (line classes). h1-h5 serif/semibold; h6 sans/muted/uppercase.
  ".cm-line.cm-h1": {
    fontFamily: SERIF,
    fontSize: "2.1rem",
    fontWeight: "600",
    lineHeight: "1.2",
  },
  ".cm-line.cm-h2": {
    fontFamily: SERIF,
    fontSize: "1.55rem",
    fontWeight: "600",
  },
  ".cm-line.cm-h3": {
    fontFamily: SERIF,
    fontSize: "1.25rem",
    fontWeight: "600",
  },
  ".cm-line.cm-h4": {
    fontFamily: SERIF,
    fontSize: "1.05rem",
    fontWeight: "600",
  },
  ".cm-line.cm-h5": {
    fontFamily: SERIF,
    fontSize: "1rem",
    fontWeight: "600",
  },
  ".cm-line.cm-h6": {
    fontSize: "0.75rem",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted-foreground)",
  },

  // Blockquote line
  ".cm-line.cm-blockquote": {
    borderLeft: "2px solid var(--border)",
    paddingLeft: "1.25rem",
    fontStyle: "italic",
    color: "var(--muted-foreground)",
  },

  // Fenced code block lines
  ".cm-line.cm-code-block": {
    fontFamily: MONO,
    fontSize: "0.85em",
    backgroundColor: "color-mix(in oklch, var(--muted) 60%, transparent)",
  },

  // Horizontal rule widget
  ".cm-hr": {
    display: "block",
    width: "100%",
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: "1.5rem 0",
  },
});
