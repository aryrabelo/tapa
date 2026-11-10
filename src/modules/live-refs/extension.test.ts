import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveRefResolved, LiveRefResult } from "@/lib/tauri";
import { editorPluginCompartment } from "@/lib/editor-extensions";
import { attachEditorView } from "@/lib/editor-view";
import { registry } from "@/lib/registry";
import { liveRefsModule } from ".";
import { liveRefs } from "./extension";
import { clearResultCache } from "./scheduler";
import { CHIP_CLASS, ChipWidget, chipView, detailDOM, stripControls } from "./widget";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const result = (state: string, extra: Partial<LiveRefResult> = {}): LiveRefResult => ({
  status: "ok",
  name: "bora-pane",
  state,
  detail: "",
  exitCode: 0,
  ms: 1,
  ...extra,
});

let view: EditorView | null = null;
let resolveCalls: string[][];
let runCalls: string[];
let output: LiveRefResult;
let configChanged: (() => void) | null;
let resolveAnswer: (texts: string[]) => Promise<LiveRefResolved[]>;

const bora = async (texts: string[]) =>
  texts.map(
    (t): LiveRefResolved => (/w\w+:p\d+$/.test(t) ? { name: "bora-pane", intervalSec: 5 } : null),
  );

function open(doc: string) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage }),
        liveRefs({
          resolve: (texts) => {
            resolveCalls.push(texts);
            return resolveAnswer(texts);
          },
          run: async (t) => {
            runCalls.push(t);
            return output;
          },
          onConfigChanged: (cb) => {
            configChanged = cb;
            return () => {
              configChanged = null;
            };
          },
          debounceMs: 300,
        }),
      ],
    }),
    parent: document.body,
  });
  return view;
}

const chips = () =>
  [...(view?.contentDOM.querySelectorAll(`.${CHIP_CLASS}`) ?? [])] as HTMLElement[];

beforeEach(() => {
  vi.useFakeTimers();
  clearResultCache();
  resolveCalls = [];
  runCalls = [];
  configChanged = null;
  output = result("done");
  resolveAnswer = bora;
});

afterEach(() => {
  view?.destroy();
  view = null;
  vi.useRealTimers();
});

describe("live references in the editor", () => {
  it("draws a chip after each resolved reference and polls each text once", async () => {
    open("a [herdr-openrig w1BA:p1] b [plain words] c [herdr-openrig w1BA:p1]");
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveCalls).toEqual([["herdr-openrig w1BA:p1", "plain words"]]);
    expect(runCalls).toEqual(["herdr-openrig w1BA:p1"]);
    expect(chips().map((c) => c.textContent)).toEqual(["done", "done"]);
    expect(chips()[0].getAttribute("role")).toBe("status");
    expect(chips()[0].getAttribute("aria-label")).toBe("herdr-openrig w1BA:p1: done");
  });

  it("never writes into the note", async () => {
    const doc = "status [w1BA:p1]\n";
    const v = open(doc);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(runCalls.length).toBeGreaterThan(1);
    expect(v.state.doc.toString()).toBe(doc);
  });

  it("shows command output as text, never as markup", async () => {
    output = result('<img src=x onerror="alert(1)">\x1b[31m', { detail: "<b>x</b>" });
    open("[w1BA:p1]");
    await vi.advanceTimersByTimeAsync(0);
    expect(view?.contentDOM.querySelector(`.${CHIP_CLASS} img`)).toBeNull();
    expect(chips()[0].textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("asks Rust again only when the set of texts changes", async () => {
    const v = open("[w1BA:p1]");
    await vi.advanceTimersByTimeAsync(0);
    v.dispatch({ changes: { from: v.state.doc.length, insert: " more words" } });
    await vi.advanceTimersByTimeAsync(400);
    expect(resolveCalls).toHaveLength(1);
    v.dispatch({ changes: { from: v.state.doc.length, insert: " [w2:p2]" } });
    await vi.advanceTimersByTimeAsync(400);
    expect(resolveCalls).toEqual([["w1BA:p1"], ["w1BA:p1", "w2:p2"]]);
  });

  it("re-resolves and forgets answers when the saved commands change", async () => {
    open("[w1BA:p1]");
    await vi.advanceTimersByTimeAsync(0);
    output = result("working");
    configChanged?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveCalls).toHaveLength(2);
    expect(chips()[0].textContent).toBe("working");
  });

  it("ignores a resolve from before a config change once the note has no references", async () => {
    let release: (answers: LiveRefResolved[]) => void = () => {};
    resolveAnswer = () => new Promise((r) => (release = r));
    const v = open("[w1BA:p1]");
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveCalls).toHaveLength(1);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "no references" } });
    configChanged?.();
    release([{ name: "bora-pane", intervalSec: 5 }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runCalls).toEqual([]);
    expect(chips()).toHaveLength(0);
  });

  it("stops polling when the note closes", async () => {
    open("[w1BA:p1]");
    await vi.advanceTimersByTimeAsync(0);
    view?.destroy();
    view = null;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runCalls).toHaveLength(1);
  });

  it("makes no native calls while the plugin is off, and resolves once it is on", async () => {
    invoke.mockResolvedValue([null]);
    registry.register(liveRefsModule);
    view = new EditorView({
      state: EditorState.create({ doc: "[w1BA:p1]", extensions: [editorPluginCompartment()] }),
      parent: document.body,
    });
    attachEditorView(view);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invoke).not.toHaveBeenCalled();
    registry.setEnabled("live-refs", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledWith("live_refs_resolve", { texts: ["w1BA:p1"] });
    registry.setEnabled("live-refs", false);
    attachEditorView(null);
  });
});

describe("chip", () => {
  const entry = (r: LiveRefResult | null, overLimit = false) => ({
    result: r,
    updatedAt: 0,
    overLimit,
  });

  it("maps answers to plain words and known agent states to a tone", () => {
    expect(chipView(entry(null)).kind).toBe("loading");
    expect(chipView(entry(result("Working")))).toMatchObject({
      kind: "ok",
      label: "Working",
      tone: "working",
    });
    expect(chipView(entry(result("42 open")))).toMatchObject({ kind: "ok", tone: "" });
    expect(chipView(entry(result("t", { status: "timeout" }))).label).toBe("timed out");
    expect(chipView(entry(result("pane gone", { status: "error" })))).toMatchObject({
      kind: "error",
      label: "pane gone",
    });
    expect(chipView(entry(result("", { status: "invalid_arg" }))).kind).toBe("invalid");
    expect(chipView(entry(null, true)).kind).toBe("limit");
    expect(chipView(entry(result("", { status: "unknown_ref" })))).toMatchObject({
      kind: "error",
      label: "not set up",
    });
    expect(chipView(entry(result("", { status: "busy" }))).kind).toBe("loading");
  });

  it("shows the hover card's output as text, never as markup", () => {
    const card = detailDOM("w1:p1", chipView(entry(result("done", { detail: "<b>x</b>" }))), 3);
    expect(card.querySelector("pre")?.textContent).toBe("<b>x</b>");
    expect(card.querySelector("b")).toBeNull();
  });

  it("compares by content so a tick with the same answer keeps the DOM", () => {
    const a = new ChipWidget("w1:p1", chipView(entry(result("done"))));
    expect(a.eq(new ChipWidget("w1:p1", chipView(entry(result("done")))))).toBe(true);
    expect(a.eq(new ChipWidget("w1:p1", chipView(entry(result("idle")))))).toBe(false);
  });

  it("strips terminal escapes and control characters", () => {
    expect(stripControls("\x1b[1;31mred\x1b[0m \x1b]8;;u\x07link\x1b]8;;\x07\x00\x07")).toBe(
      "red link",
    );
  });
});
