import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { installContextMenuBlocker } from "./lib/context-menu";
import { useStore } from "./state/store";
import "./index.css";

// Lazy-load both window trees so each webview pulls only its own bundle: the
// main window never imports the overlay, and the overlay never imports App.
const App = lazy(() => import("./App"));
const Teleprompter = lazy(() =>
  import("@/modules/teleprompter/Teleprompter").then((m) => ({ default: m.Teleprompter })),
);

// The overlay webview carries the label "teleprompter"; everything else is the
// main app. Resolving the label throws outside a Tauri webview (tests, plain
// browser), so default to "main".
function currentLabel(): string {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

// Apply the persisted theme before first paint to avoid a flash of the wrong theme.
applyTheme(getStoredTheme());

// Block the default webview right-click menu (a custom app menu comes later).
installContextMenuBlocker();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// Dev-only: expose the store on window so the UI can be driven from a plain
// browser (console / automation) for visual checks. Stripped from prod builds.
if (import.meta.env.DEV) {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {currentLabel() === "teleprompter" ? <Teleprompter /> : <App />}
    </Suspense>
  </React.StrictMode>,
);

// Optional dev bug-capture overlay. Gated on VITE_BUGTOPROMPT so the default
// release build dead-code-eliminates the dynamic import (zero added bytes).
if (import.meta.env.VITE_BUGTOPROMPT && currentLabel() === "main") {
  void import("./bugtoprompt").then((m) => m.mountBugToPrompt());
}
