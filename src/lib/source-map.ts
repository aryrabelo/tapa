export interface SourceSpan {
  soStart: number; // source offset of the span start (from data-so)
  text: string; // rendered text of the span
}

// Pure kernel: map a caret local offset within a span to a source offset.
export function resolveSourceOffset(span: SourceSpan, localOffset: number): number {
  const clamped = Math.max(0, Math.min(localOffset, span.text.length));
  return span.soStart + clamped;
}

// DOM-facing helper (exercised in component tests, not the pure unit test).
// Walks up from a node to the nearest element carrying a numeric data-so attribute.
export function nearestSourceSpan(node: Node | null): { el: HTMLElement; soStart: number } | null {
  let el: HTMLElement | null =
    node && node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
  while (el) {
    const so = el.dataset?.so;
    if (so != null && !Number.isNaN(Number(so))) return { el, soStart: Number(so) };
    el = el.parentElement;
  }
  return null;
}

// Composes the browser caret API + the kernel. Returns a source offset or null.
export function sourceOffsetFromPoint(x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  const span = nearestSourceSpan(node);
  if (!span) return null;
  // TODO(v2): when the caret API returns an Element node (not a text node), `offset` is a
  // child index rather than a character offset; resolveSourceOffset then yields an approximate
  // value. Accepted v1 risk (see spec section 4). Refine per text-node when needed.
  const text = node?.textContent ?? "";
  return resolveSourceOffset({ soStart: span.soStart, text }, offset);
}
