import { describe, expect, it, vi } from "vitest";
import { createRegistry, matchesBinding } from "@/lib/registry";
import type { Disposer, Module, ReaderContext } from "@/lib/registry";

function makeModule(over: Partial<Module> = {}): Module {
  return {
    id: "m",
    register: () => {},
    activate: () => {},
    ...over,
  };
}

describe("registry", () => {
  it("register is eager and does not activate", () => {
    const activate = vi.fn();
    const reg = createRegistry();
    reg.register(
      makeModule({
        id: "search",
        register: (r) => r.command({ id: "search.open", title: "Search", run: () => {} }),
        activate,
      }),
    );
    expect(reg.commands().map((c) => c.id)).toEqual(["search.open"]);
    expect(activate).not.toHaveBeenCalled();
  });

  it("runCommand activates the owning module once, then runs", async () => {
    const activate = vi.fn();
    const run = vi.fn();
    const reg = createRegistry();
    reg.register(
      makeModule({
        id: "search",
        register: (r) => r.command({ id: "search.open", title: "Search", run }),
        activate,
      }),
    );
    await reg.runCommand("search.open");
    await reg.runCommand("search.open");
    expect(activate).toHaveBeenCalledTimes(1); // idempotent
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("on() delivers events and the disposer unsubscribes", () => {
    const reg = createRegistry();
    const handler = vi.fn();
    const off = reg.on("ping", handler);
    reg.emit("ping", 1);
    off();
    reg.emit("ping", 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it("deactivate runs disposers recorded during activate", async () => {
    const off = vi.fn();
    const reg = createRegistry();
    reg.register(
      makeModule({
        id: "search",
        register: (r) => r.command({ id: "search.open", title: "S", run: () => {} }),
        activate: (ctx) => {
          ctx.onDispose(off);
          ctx.on("x", () => {});
        },
      }),
    );
    await reg.runCommand("search.open");
    reg.deactivate("search");
    expect(off).toHaveBeenCalledTimes(1);
    reg.emit("x", 1); // subscription torn down — no throw, no handler
  });
});

describe("matchesBinding", () => {
  const ev = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
  it("matches mod+shift+key for ⌘⇧F and Ctrl+Shift+F", () => {
    expect(matchesBinding("mod+shift+f", ev({ key: "F", metaKey: true, shiftKey: true }))).toBe(
      true,
    );
    expect(matchesBinding("mod+shift+f", ev({ key: "f", ctrlKey: true, shiftKey: true }))).toBe(
      true,
    );
  });
  it("rejects missing or extra modifiers", () => {
    expect(matchesBinding("mod+shift+f", ev({ key: "f", metaKey: true }))).toBe(false); // no shift
    expect(matchesBinding("mod+k", ev({ key: "k", metaKey: true }))).toBe(true);
    expect(matchesBinding("mod+k", ev({ key: "k", metaKey: true, shiftKey: true }))).toBe(false); // extra shift
    expect(matchesBinding("mod+k", ev({ key: "k" }))).toBe(false); // no mod
  });
});

describe("runKeybinding", () => {
  const ev = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
  it("runs the command whose keybinding matches and returns whether it matched", async () => {
    const run = vi.fn();
    const reg = createRegistry();
    reg.register(
      makeModule({
        id: "m",
        register: (r) => r.command({ id: "c", title: "C", keybinding: "mod+shift+f", run }),
      }),
    );
    expect(reg.runKeybinding(ev({ key: "f", metaKey: true, shiftKey: true }))).toBe(true);
    expect(reg.runKeybinding(ev({ key: "g", metaKey: true, shiftKey: true }))).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("context-menu items", () => {
  const ctx = (over: Partial<ReaderContext> = {}): ReaderContext => ({
    element: document.createElement("div"),
    sourceOffset: null,
    line: null,
    selection: "",
    path: null,
    ...over,
  });

  it("registerContextMenuItem exposes items filtered by when(ctx)", async () => {
    const reg = createRegistry();
    reg.register(
      makeModule({
        register: (r) => r.command({ id: "c", title: "C", run: () => {} }),
        activate: (c) => {
          c.registerContextMenuItem({ id: "always", label: "Always", run: () => {} });
          c.registerContextMenuItem({
            id: "selection",
            label: "On selection",
            when: (rc) => rc.selection.length > 0,
            run: () => {},
          });
        },
      }),
    );
    await reg.activate("m");
    expect(reg.contextMenuItems(ctx()).map((i) => i.id)).toEqual(["always"]);
    expect(reg.contextMenuItems(ctx({ selection: "hi" })).map((i) => i.id)).toEqual([
      "always",
      "selection",
    ]);
  });

  it("runs an item's run with the supplied reader context", async () => {
    const run = vi.fn();
    const reg = createRegistry();
    reg.register(
      makeModule({
        register: (r) => r.command({ id: "c", title: "C", run: () => {} }),
        activate: (c) => {
          c.registerContextMenuItem({ id: "go", label: "Go", run });
        },
      }),
    );
    await reg.activate("m");
    const rc = ctx({ path: "a.md", line: 4 });
    reg.contextMenuItems(rc)[0].run(rc);
    expect(run).toHaveBeenCalledWith(rc);
  });
});

describe("reader render hook", () => {
  it("invokes callbacks on emit and immediately with the last container", async () => {
    const reg = createRegistry();
    const seen: HTMLElement[] = [];
    reg.register(
      makeModule({
        register: (r) => r.command({ id: "c", title: "C", run: () => {} }),
        activate: (c) => {
          c.onReaderRender((el) => seen.push(el));
        },
      }),
    );
    const first = document.createElement("article");
    reg.emitReaderRender(first); // before activate: stored, no subscriber yet
    await reg.activate("m"); // subscribing replays the last container
    expect(seen).toEqual([first]);
    const second = document.createElement("article");
    reg.emitReaderRender(second);
    expect(seen).toEqual([first, second]);
  });
});

describe("registerStyle", () => {
  const stylesWith = (needle: string) =>
    [...document.head.querySelectorAll("style")].filter((s) => s.textContent?.includes(needle));

  it("injects a <style> element and removes it on dispose", async () => {
    const reg = createRegistry();
    let off: Disposer = () => {};
    reg.register(
      makeModule({
        register: (r) => r.command({ id: "c", title: "C", run: () => {} }),
        activate: (c) => {
          off = c.registerStyle(".tapa-test-style{color:red}");
        },
      }),
    );
    await reg.activate("m");
    expect(stylesWith(".tapa-test-style")).toHaveLength(1);
    off();
    expect(stylesWith(".tapa-test-style")).toHaveLength(0);
  });
});
