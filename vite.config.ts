import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // React -> preact/compat (smaller webview runtime). jsx-runtime entries must
  // precede the bare `react` alias, and react/jsx-dev-runtime maps to the prod
  // preact jsx-runtime so react-markdown never reaches React's element-freezing
  // dev factory.
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
      { find: /^react\/jsx-dev-runtime$/, replacement: "preact/jsx-runtime" },
      { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
      { find: /^react-dom$/, replacement: "preact/compat" },
      { find: /^react$/, replacement: "preact/compat" },
    ],
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Tauri ships a modern WebKit/WebView2 runtime, so skip esbuild downleveling
  // and emit modern JS — fewer transpile helpers across the whole bundle.
  build: { target: "esnext" },
});
