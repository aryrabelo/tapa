import type * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { editorPluginCompartment } from "@/lib/editor-extensions";
import { attachEditorView } from "@/lib/editor-view";
import { bootEditorPlugins } from "@/lib/plugins";
import { useStore } from "@/state/store";

interface Props {
  doc: string;
  cursor: number; // initial source offset
  onChange: (doc: string) => void;
  onSave: () => void; // Cmd/Ctrl-S, stays on this page
  onBlurSave: () => Promise<boolean>;
}

function scrollToLine(view: EditorView, line: number): void {
  const n = Math.min(Math.max(line, 1), view.state.doc.lines);
  const pos = view.state.doc.line(n).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  useStore.getState().setScrollLine(null);
}

export function Editor({ doc, cursor, onChange, onSave, onBlurSave }: Props): React.ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const docRef = useRef(doc);
  const applying = useRef(false);
  docRef.current = doc;
  const scrollLine = useStore((s) => s.scrollLine);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is created once per note (App keys it by path). doc/cursor are the initial values; later disk reloads sync through the doc effect. Handlers read live state via the refs below.
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    let cancelled = false;
    let created: EditorView | null = null;
    void (async () => {
      await bootEditorPlugins();
      if (cancelled || !host.current) return;
      const initial = docRef.current;
      const state = EditorState.create({
        doc: initial,
        selection: { anchor: Math.min(cursor, initial.length) },
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
          markdown({ base: markdownLanguage }),
          EditorView.domEventHandlers({
            blur: () => {
              void onBlurSave();
              return false;
            },
          }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (applying.current || !u.docChanged) return;
            onChange(u.state.doc.toString());
          }),
          editorPluginCompartment(),
        ],
      });
      created = new EditorView({ state, parent: host.current });
      view.current = created;
      attachEditorView(created);
      created.focus();
      // WebKit can drop the focus if the element that had it (e.g. the file
      // finder's input) is removed around now. Ask again after the current
      // task (not on an animation frame: WKWebView pauses those while the
      // window is covered) so the note that just opened takes the keyboard.
      setTimeout(() => {
        if (!cancelled && created && !created.hasFocus) created.focus();
      }, 0);
      const pending = useStore.getState().scrollLine;
      if (pending != null) scrollToLine(created, pending);
    })();
    return () => {
      cancelled = true;
      attachEditorView(null);
      created?.destroy();
      view.current = null;
    };
  }, []);

  // Disk reloads replace the buffer. Typing already matches `doc`, so this no-ops.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur === doc) return;
    applying.current = true;
    v.dispatch({ changes: { from: 0, to: cur.length, insert: doc } });
    applying.current = false;
  }, [doc]);

  useEffect(() => {
    const v = view.current;
    if (!v || scrollLine == null) return;
    scrollToLine(v, scrollLine);
  }, [scrollLine]);

  return <div ref={host} className="h-full" />;
}
