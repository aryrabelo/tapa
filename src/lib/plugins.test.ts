import { beforeEach, describe, expect, it } from "vitest";
import { isPluginEnabled } from "./plugins";

describe("plugin defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("turns formatted reading and tables on, and teleprompter and brain off", () => {
    expect(isPluginEnabled("live-preview")).toBe(true);
    expect(isPluginEnabled("tables")).toBe(true);
    expect(isPluginEnabled("autocomplete")).toBe(true);
    expect(isPluginEnabled("teleprompter")).toBe(false);
    expect(isPluginEnabled("brain")).toBe(false);
    expect(isPluginEnabled("search")).toBe(true);
  });

  it("remembers a switch the user flipped", () => {
    localStorage.setItem(
      "tapa-plugin-overrides",
      JSON.stringify({ teleprompter: true, tables: false }),
    );
    expect(isPluginEnabled("teleprompter")).toBe(true);
    expect(isPluginEnabled("tables")).toBe(false);
  });

  it("treats the old disabled list as off", () => {
    localStorage.setItem("tapa-disabled-plugins", JSON.stringify(["tables"]));
    expect(isPluginEnabled("tables")).toBe(false);
    expect(localStorage.getItem("tapa-disabled-plugins")).toBeNull();
    expect(isPluginEnabled("live-preview")).toBe(true);
  });
});
