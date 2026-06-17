import { Monitor, Moon, Sun } from "@/components/ui/icons";
import type * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, nextTheme, setStoredTheme, type Theme } from "@/lib/theme";

const ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const LABELS: Record<Theme, string> = {
  light: "Theme: light",
  dark: "Theme: dark",
  system: "Theme: system",
};

export function ThemeToggle(): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
    if (theme !== "system") return;
    // While following the system, react to OS appearance changes live.
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const Icon = ICONS[theme];
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7"
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon className="size-4" />
    </Button>
  );
}
