import type * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { livePreview } from "./live-preview";
import { livePreviewTheme } from "./live-preview-theme";

interface Props {
  doc: string;
  cursor: number; // initial source offset
  onChange: (doc: string) => void;
  onExit: () => void; // double-click exits edit mode
  onSave: () => void; // Cmd/Ctrl-S
  onBlurSave: () => Promise<boolean>; // autosave on blur; resolves true iff it saved
}

export function Editor({
  doc,
  cursor,
  onChange,
  onExit,
  onSave,
  onBlurSave,
}: Props): React.ReactElement {
  const [saved, setSaved] = useState(false);
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
        EditorView.domEventHandlers({
          blur: () => {
            void onBlurSave().then((didSave) => {
              if (didSave) setSaved(true);
            });
            return false;
          },
          focus: () => {
            setSaved(false);
            return false;
          },
        }),
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: double-click on the editor host enters/exits edit mode; a keyboard/command-palette equivalent is provided elsewhere.
    <div
      ref={host}
      className={`h-full border border-transparent${saved ? " tapa-saved-flash" : ""}`}
      onDoubleClick={onExit}
    />
  );
}
