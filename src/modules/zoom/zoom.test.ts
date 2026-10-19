import { beforeEach, describe, expect, it } from "vitest";
import { createRegistry } from "@/lib/registry";
import { getZoom, zoomModule } from "@/modules/zoom";

const cssZoom = () => document.documentElement.style.getPropertyValue("--text-zoom");

function boot() {
  const reg = createRegistry();
  reg.register(zoomModule);
  return reg;
}

describe("zoom", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--text-zoom");
  });

  it("applies the saved size to :root when the module loads", () => {
    localStorage.setItem("tapa-text-zoom", "130");
    boot();
    expect(cssZoom()).toBe("1.3");
  });

  it("falls back to 100% for a missing, corrupt or out-of-range saved value", () => {
    for (const bad of ["", "abc", "500", "75", "105"]) {
      localStorage.setItem("tapa-text-zoom", bad);
      expect(getZoom()).toBe(100);
    }
  });

  it("steps by 10% and stops at 200%", async () => {
    localStorage.setItem("tapa-text-zoom", "190");
    const reg = boot();
    await reg.runCommand("view.zoomIn");
    expect(getZoom()).toBe(200);
    await reg.runCommand("view.zoomIn");
    expect(getZoom()).toBe(200);
    expect(cssZoom()).toBe("2");
  });

  it("stops at 80% going down, and Actual Size returns to 100%", async () => {
    const reg = boot();
    for (let i = 0; i < 5; i++) await reg.runCommand("view.zoomOut");
    expect(getZoom()).toBe(80);
    expect(cssZoom()).toBe("0.8");
    await reg.runCommand("view.zoomReset");
    expect(getZoom()).toBe(100);
    expect(cssZoom()).toBe("1");
  });

  it("persists the size for the next launch", async () => {
    await boot().runCommand("view.zoomIn");
    expect(localStorage.getItem("tapa-text-zoom")).toBe("110");
    document.documentElement.style.removeProperty("--text-zoom");
    boot(); // next launch
    expect(cssZoom()).toBe("1.1");
  });
});
