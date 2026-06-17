import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";

// Pull the mdast/hast source-start offset off the node passed by react-markdown.
function so(node: unknown): number | undefined {
  const pos = (node as { position?: { start?: { offset?: number } } })?.position;
  return pos?.start?.offset;
}

export const markdownComponents: Components = {
  h1: ({ node, ...p }) => (
    <h1
      data-so={so(node)}
      className="mt-10 mb-4 font-serif text-[2.1rem] font-semibold leading-tight tracking-tight"
      {...p}
    />
  ),
  h2: ({ node, ...p }) => (
    <h2
      data-so={so(node)}
      className="mt-9 mb-3 font-serif text-[1.55rem] font-semibold tracking-tight"
      {...p}
    />
  ),
  h3: ({ node, ...p }) => (
    <h3 data-so={so(node)} className="mt-7 mb-2 font-serif text-[1.25rem] font-semibold" {...p} />
  ),
  h4: ({ node, ...p }) => (
    <h4 data-so={so(node)} className="mt-6 mb-2 font-serif text-[1.05rem] font-semibold" {...p} />
  ),
  h5: ({ node, ...p }) => (
    <h5 data-so={so(node)} className="mt-6 mb-2 font-serif text-base font-semibold" {...p} />
  ),
  h6: ({ node, ...p }) => (
    <h6
      data-so={so(node)}
      className="mt-6 mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      {...p}
    />
  ),
  p: ({ node, ...p }) => <p data-so={so(node)} className="my-4 leading-[1.75]" {...p} />,
  ul: ({ node, ...p }) => (
    <ul data-so={so(node)} className="my-4 ml-6 list-disc space-y-1.5" {...p} />
  ),
  ol: ({ node, ...p }) => (
    <ol data-so={so(node)} className="my-4 ml-6 list-decimal space-y-1.5" {...p} />
  ),
  li: ({ node, ...p }) => <li data-so={so(node)} className="marker:text-muted-foreground" {...p} />,
  blockquote: ({ node, ...p }) => (
    <blockquote
      data-so={so(node)}
      className="my-6 border-border border-l-2 pl-5 italic text-muted-foreground"
      {...p}
    />
  ),
  table: ({ node, ...p }) => <table data-so={so(node)} className="my-6 w-full text-sm" {...p} />,
  th: ({ node: _node, ...p }) => (
    <th className="border-b pr-4 pb-2 text-left font-semibold" {...p} />
  ),
  td: ({ node: _node, ...p }) => <td className="border-border/60 border-b py-2 pr-4" {...p} />,
  code: ({ node: _node, className, ...p }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    return (
      <code
        className={cn(
          isBlock ? "font-mono" : "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...p}
      />
    );
  },
  pre: ({ node, ...p }) => (
    <pre
      data-so={so(node)}
      className="my-6 overflow-x-auto rounded-lg border bg-muted/60 p-4 font-mono text-sm leading-relaxed"
      {...p}
    />
  ),
  a: ({ node: _node, ...p }) => (
    <a
      className="text-link underline decoration-link/40 underline-offset-[3px] hover:decoration-link"
      {...p}
    />
  ),
  img: ({ node: _node, alt, ...p }) => (
    <img className="my-6 h-auto max-w-full rounded-lg border" alt={alt ?? ""} {...p} />
  ),
};
