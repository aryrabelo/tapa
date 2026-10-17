// Optional in-app bug-capture overlay (bugtoprompt). Mounted only when
// VITE_BUGTOPROMPT is set; kept out of the default release bundle via the
// build-time-DCE'd dynamic import in main.tsx.
import { BugToPrompt } from "bugtoprompt";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";

// bugtoprompt ships a global Window augmentation, but it is not picked up across
// the package boundary under this tsconfig, so declare the subset we set here.
declare global {
  interface Window {
    __BUGTOPROMPT__?: {
      screenshotMode?: "perPage" | "onMark" | "off";
      modes?: ("issue" | "clipboard" | "download")[];
      mintStreamingToken?: () => Promise<string>;
      assemblyAiKey?: string;
      streamingToken?: string;
      baseUrl?: string;
    };
  }
}

export function mountBugToPrompt(): void {
  window.__BUGTOPROMPT__ = {
    ...window.__BUGTOPROMPT__,
    // WKWebView has no reliable getDisplayMedia; capture DOM snapshots only.
    screenshotMode: "off",
    modes: ["clipboard", "download"],
    // The AssemblyAI v3 token mint is CORS-blocked inside the webview, so mint
    // it in Rust (no CORS); the streaming WebSocket itself is CORS-exempt. The
    // key lives only in the host env (never the bundle): Rust reads
    // ASSEMBLYAI_API_KEY and returns an error when unset, so voice simply stays
    // disabled without a key — no frontend gate needed.
    mintStreamingToken: (): Promise<string> => invoke<string>("mint_assemblyai_token"),
  };
  const host = document.createElement("div");
  host.id = "bugtoprompt-root";
  document.body.appendChild(host);
  createRoot(host).render(<BugToPrompt />);
}
