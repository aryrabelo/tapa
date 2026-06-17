import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getStoredTheme, isDark, nextTheme, setStoredTheme } from "./theme";

function stubPrefersDark(matches: boolean): void {
  window.matchMedia = vi.fn(
    () => ({ matches, media: "(prefers-color-scheme: dark)" }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  // @ts-expect-error test cleanup
  window.matchMedia = undefined;
});

describe("theme", () => {
  it("cycles light -> dark -> system -> light", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });

  it("resolves isDark from explicit choice or the system preference", () => {
    stubPrefersDark(true);
    expect(isDark("light")).toBe(false);
    expect(isDark("dark")).toBe(true);
    expect(isDark("system")).toBe(true);
    stubPrefersDark(false);
    expect(isDark("system")).toBe(false);
  });

  it("applyTheme toggles the dark class to match the resolved theme", () => {
    stubPrefersDark(false);
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    stubPrefersDark(true);
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists and reads the stored theme, defaulting to light", () => {
    expect(getStoredTheme()).toBe("light");
    setStoredTheme("light");
    expect(getStoredTheme()).toBe("light");
    setStoredTheme("dark");
    expect(getStoredTheme()).toBe("dark");
  });
});
