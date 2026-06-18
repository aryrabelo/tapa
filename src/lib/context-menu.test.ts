import { describe, expect, it, vi } from "vitest";
import { getMenuState, handleContextMenu } from "@/lib/context-menu";

function contextEvent(target: Element): MouseEvent {
  const e = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 20,
  });
  Object.defineProperty(e, "target", { value: target, configurable: true });
  return e;
}

describe("handleContextMenu", () => {
  it("keeps the native menu in inputs", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const e = contextEvent(input);
    const spy = vi.spyOn(e, "preventDefault");
    handleContextMenu(e);
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the native menu inside an editable region (the editor)", () => {
    const cm = document.createElement("div");
    cm.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    cm.appendChild(inner);
    document.body.appendChild(cm);
    const e = contextEvent(inner);
    const spy = vi.spyOn(e, "preventDefault");
    handleContextMenu(e);
    expect(spy).not.toHaveBeenCalled();
  });

  it("blocks the bare menu outside the reader without opening the in-app menu", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const e = contextEvent(div);
    const spy = vi.spyOn(e, "preventDefault");
    handleContextMenu(e);
    expect(spy).toHaveBeenCalled();
    expect(getMenuState().open).toBe(false);
  });

  it("blocks in the reader and, with no contributed items, leaves the menu closed", () => {
    const reader = document.createElement("article");
    reader.setAttribute("data-reader", "");
    const block = document.createElement("p");
    block.setAttribute("data-so", "0");
    reader.appendChild(block);
    document.body.appendChild(reader);
    const e = contextEvent(block);
    const spy = vi.spyOn(e, "preventDefault");
    handleContextMenu(e);
    expect(spy).toHaveBeenCalled();
    // The shared singleton registry has no items registered in this unit, so the
    // handler falls back to the historical "just block" behavior.
    expect(getMenuState().open).toBe(false);
  });
});
