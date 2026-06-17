import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // Mirror vite's preact aliases so tests run on the SHIPPED runtime, and inline
  // the React-importing deps so the alias actually reaches inside them (vitest
  // does not rewrite prebundled node_modules otherwise).
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: /^@testing-library\/react$/, replacement: "@testing-library/preact" },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
      { find: /^react\/jsx-dev-runtime$/, replacement: "preact/jsx-runtime" },
      { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
      { find: /^react-dom$/, replacement: "preact/compat" },
      { find: /^react$/, replacement: "preact/compat" },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    server: {
      deps: {
        inline: [/react-markdown/, /zustand/, /use-sync-external-store/, /radix-ui/, /lucide-react/, /cmdk/],
      },
    },
  },
});
