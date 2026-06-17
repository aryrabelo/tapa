import type * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";

interface Props {
  doc: string;
  cursor: number; // initial source offset
  onChange: (doc: string) => void;
  onExit: () => void; // double-click exits edit mode
  onSave: () => void; // Cmd/Ctrl-S
}

export function Editor({ doc, cursor, onChange, onExit, onSave }: Props): React.ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is intentionally created once on mount (re-creating it on every prop change would destroy editing/undo state). doc/cursor are used only as initial values; the onChange/onSave closures capture the first-render handlers, which is safe because App passes stable handlers that read live state via useStore.getState(). onExit is bound on the JSX div (rebound each render), not captured here.
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc,
      selection: { anchor: Math.min(cursor, doc.length) },
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            backgroundColor: "transparent",
            color: "var(--foreground)",
            fontSize: "15px",
          },
          ".cm-scroller": {
            fontFamily: 'ui-monospace, "SF Mono", "Menlo", monospace',
            lineHeight: "1.6",
          },
          ".cm-content": {
            maxWidth: "720px",
            margin: "0 auto",
            padding: "1rem",
            caretColor: "var(--foreground)",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--foreground)",
            borderLeftWidth: "2px",
          },
          "&.cm-focused .cm-cursor": {
            borderLeftColor: "var(--foreground)",
          },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
            {
              backgroundColor: "color-mix(in oklch, var(--ring) 35%, transparent)",
            },
          ".cm-gutters": {
            backgroundColor: "transparent",
            color: "var(--muted-foreground)",
            border: "none",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-activeLine": { backgroundColor: "transparent" },
          ".cm-activeLineGutter": { backgroundColor: "transparent" },
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    v.focus();
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // biome-ignore lint/a11y/noStaticElementInteractions: double-click on the editor host enters/exits edit mode; a keyboard/command-palette equivalent is provided elsewhere.
  return <div ref={host} className="h-full" onDoubleClick={onExit} />;
}
