import type * as React from "react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./components";
import { lineStartOffset, sourceOffsetFromPoint } from "@/lib/source-map";
import { useStore } from "@/state/store";

export function Reader({
  content,
  path,
  onEditAt,
}: {
  content: string;
  path?: string;
  onEditAt: (offset: number) => void;
}): React.ReactElement {
  const containerRef = useRef<HTMLElement>(null);
  const scrollLine = useStore((st) => st.scrollLine);

  // After a search jump, scroll to the rendered block nearest the target line's
  // source offset (data-so), then consume the request so it fires once.
  useEffect(() => {
    if (scrollLine == null || !containerRef.current) return;
    const target = lineStartOffset(content, scrollLine);
    let best: HTMLElement | null = null;
    for (const el of containerRef.current.querySelectorAll<HTMLElement>("[data-so]")) {
      const offset = Number(el.dataset.so);
      if (!Number.isNaN(offset) && offset <= target) best = el;
    }
    best?.scrollIntoView({ block: "start" });
    useStore.getState().setScrollLine(null);
  }, [scrollLine, content]);
  return (
    <article
      ref={containerRef}
      className="mx-auto max-w-[680px] px-8 py-14 font-serif text-[1.125rem] leading-[1.75] text-foreground"
      onDoubleClick={(e) => {
        const off = sourceOffsetFromPoint(e.clientX, e.clientY);
        onEditAt(off ?? 0);
      }}
    >
      {path && (
        <p className="mb-10 font-sans text-xs uppercase tracking-wide text-muted-foreground">
          {path}
        </p>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkFrontmatter]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
