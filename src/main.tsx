import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { useStore } from "./state/store";
import "./index.css";

// Apply the persisted theme before first paint to avoid a flash of the wrong theme.
applyTheme(getStoredTheme());

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// Dev-only: expose the store on window so the UI can be driven from a plain
// browser (console / automation) for visual checks. Stripped from prod builds.
if (import.meta.env.DEV) {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
