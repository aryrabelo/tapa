import { EditorState, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorPluginCompartment } from "@/lib/editor-extensions";
import { attachEditorView } from "@/lib/editor-view";
import { setPluginConfigValue } from "@/lib/plugin-config";
import { isPluginEnabled, setPluginRunning } from "@/lib/plugins";
import { registry } from "@/lib/registry";
import { settingsModule } from "@/modules/settings";
import { focusModule } from ".";
import "./jsdom-layout";

const DOC = "One goes first. Two sits here. Three ends it.";
// Class of the value EditorView.scrollIntoView builds (its effect type is internal).
const ScrollTarget = (EditorView.scrollIntoView(0).value as object).constructor;
let view: EditorView;
let seen: Transaction[];

// The app's editor wiring: plugins reach the live view only through the
// shared compartment, the same path a Settings switch takes.
beforeEach(() => {
  localStorage.clear();
  seen = [];
  view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: { anchor: DOC.indexOf("sits") },
      extensions: [
        editorPluginCompartment(),
        EditorView.updateListener.of((u) => seen.push(...u.transactions)),
      ],
    }),
    parent: document.body,
  });
  attachEditorView(view);
});

afterEach(() => {
  registry.setEnabled("focus", false);
  attachEditorView(null);
  view.destroy();
  localStorage.clear();
});

const dimmed = () => view.contentDOM.querySelectorAll(".cm-tapa-dim").length;

/** Moves the caret like an arrow key would and reports whether it asked to centre. */
function moveCentres(): boolean {
  seen = [];
  view.dispatch({ selection: { anchor: DOC.indexOf("Three") }, userEvent: "select" });
  return centreRequested();
}

function centreRequested(): boolean {
  return seen.some((tr) =>
    tr.effects.some(
      (e) => e.value instanceof ScrollTarget && "y" in e.value && e.value.y === "center",
    ),
  );
}

describe("focus plugin", () => {
  it("centres the open note's caret line when Focus turns on", async () => {
    registry.register(focusModule);
    registry.setEnabled("focus", true);
    await vi.waitFor(() => expect(centreRequested()).toBe(true));
  });

  it("adds both behaviours when on and none when off", () => {
    registry.register(focusModule);
    registry.setEnabled("focus", true);
    expect(dimmed()).toBeGreaterThan(0);
    expect(moveCentres()).toBe(true);

    registry.setEnabled("focus", false);
    expect(registry.editorExtensions()).toEqual([]);
    expect(dimmed()).toBe(0);
    expect(moveCentres()).toBe(false);
  });

  it("each switch removes only its own behaviour, on the open editor", () => {
    registry.register(focusModule);
    registry.setEnabled("focus", true);

    setPluginConfigValue("focus", "dim", "false");
    expect(dimmed()).toBe(0);
    expect(moveCentres()).toBe(true);

    setPluginConfigValue("focus", "dim", "true");
    setPluginConfigValue("focus", "typewriter", "false");
    expect(dimmed()).toBeGreaterThan(0);
    expect(moveCentres()).toBe(false);
    expect(view.contentDOM.style.paddingBottom).toBe("");
  });

  it("changing the dim switch does not re-centre the note", async () => {
    registry.register(focusModule);
    registry.setEnabled("focus", true);
    await vi.waitFor(() => expect(centreRequested()).toBe(true));

    seen = [];
    setPluginConfigValue("focus", "dim", "false");
    setPluginConfigValue("focus", "dim", "true");
    // Arrival centring runs in a microtask queued during the swap; this one runs after it.
    await new Promise<void>((done) => queueMicrotask(done));
    expect(centreRequested()).toBe(false);
    expect(dimmed()).toBeGreaterThan(0);
  });

  it("on then off before the code arrives ends off", async () => {
    const on = setPluginRunning("focus", true);
    const off = setPluginRunning("focus", false);
    await Promise.all([on, off]);
    expect(isPluginEnabled("focus")).toBe(false);
    expect(registry.editorExtensions()).toEqual([]);
    expect(dimmed()).toBe(0);
  });

  it("⌘⇧D turns the whole plugin on from off, then off again", async () => {
    registry.register(settingsModule);
    expect(isPluginEnabled("focus")).toBe(false);
    const key = () => new KeyboardEvent("keydown", { key: "D", metaKey: true, shiftKey: true });

    expect(registry.runKeybinding(key())).toBe(true);
    await vi.waitFor(() => expect(dimmed()).toBeGreaterThan(0));
    expect(isPluginEnabled("focus")).toBe(true);

    expect(registry.runKeybinding(key())).toBe(true);
    await vi.waitFor(() => expect(dimmed()).toBe(0));
    expect(isPluginEnabled("focus")).toBe(false);
  });
});
