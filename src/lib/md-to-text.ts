// Strip Markdown syntax down to readable plain text. Pure, no deps: the
// teleprompter overlay scrolls prose, not raw syntax.
export function mdToText(md: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    // Fenced code: drop the ``` / ~~~ markers, keep the code lines verbatim.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // Horizontal rule (---, ***, ___, with optional spaces) -> blank line.
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push("");
      continue;
    }
    out.push(stripInline(stripBlockMarkers(line)));
  }
  // Collapse 3+ consecutive newlines to a single blank line.
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Remove leading block markers: ATX heading, blockquote, list bullet/number.
function stripBlockMarkers(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>+\s?/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
}

// Unwrap inline markdown to its text content.
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // image -> alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // link -> link text
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/~~(.*?)~~/g, "$1"); // strikethrough
}
