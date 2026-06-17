export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "tapa-theme";
const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

const DEFAULT_THEME: Theme = "light";

export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME;
}

export function setStoredTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme);
}

/** Resolve a theme choice to whether dark should be active right now. */
export function isDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark());
}

/** Apply the resolved theme by toggling the `dark` class on <html>. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark(theme));
}

/** Next theme in the light -> dark -> system cycle. */
export function nextTheme(theme: Theme): Theme {
  const i = THEMES.indexOf(theme);
  return THEMES[(i + 1) % THEMES.length];
}
