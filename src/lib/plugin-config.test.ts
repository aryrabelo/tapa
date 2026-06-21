import { beforeEach, describe, expect, it } from "vitest";
import { getPluginConfigValue, setPluginConfigValue } from "./plugin-config";

describe("plugin-config", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null for an unset value", () => {
    expect(getPluginConfigValue("brain", "dir")).toBeNull();
  });

  it("returns the value after setting it", () => {
    setPluginConfigValue("brain", "dir", "~/notes");
    expect(getPluginConfigValue("brain", "dir")).toBe("~/notes");
  });

  it("keeps two keys under one plugin without clobbering", () => {
    setPluginConfigValue("brain", "dir", "~/notes");
    setPluginConfigValue("brain", "name", "Ideas");
    expect(getPluginConfigValue("brain", "dir")).toBe("~/notes");
    expect(getPluginConfigValue("brain", "name")).toBe("Ideas");
  });

  it("isolates values across plugins", () => {
    setPluginConfigValue("brain", "dir", "~/brain");
    setPluginConfigValue("livewrite", "dir", "~/live");
    expect(getPluginConfigValue("brain", "dir")).toBe("~/brain");
    expect(getPluginConfigValue("livewrite", "dir")).toBe("~/live");
  });
});
