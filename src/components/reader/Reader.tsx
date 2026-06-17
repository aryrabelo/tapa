import type * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./components";
import { sourceOffsetFromPoint } from "@/lib/source-map";

export function Reader({
  content,
  path,
  onEditAt,
}: {
  content: string;
  path?: string;
  onEditAt: (offset: number) => void;
}): React.ReactElement {
  return (
    <article
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
