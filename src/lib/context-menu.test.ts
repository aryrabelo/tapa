import { describe, expect, it, vi } from "vitest";
import { blockContextMenu } from "@/lib/context-menu";

function contextEvent(target: Element): MouseEvent {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "target", { value: target, configurable: true });
  return e;
}

describe("blockContextMenu", () => {
  it("blocks the menu on non-editable content (the reader)", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const e = contextEvent(div);
    const spy = vi.spyOn(e, "preventDefault");
    blockContextMenu(e);
    expect(spy).toHaveBeenCalled();
  });

  it("keeps the native menu in inputs", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const e = contextEvent(input);
    const spy = vi.spyOn(e, "preventDefault");
    blockContextMenu(e);
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
    blockContextMenu(e);
    expect(spy).not.toHaveBeenCalled();
  });
});
