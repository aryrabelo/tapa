import type * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { livePreview } from "./live-preview";
import { livePreviewTheme } from "./live-preview-theme";

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
        livePreview,
        livePreviewTheme,
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
