import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { mdToText } from "@/lib/md-to-text";
import { useStore } from "@/state/store";

// MAIN-side controller for the teleprompter overlay: owns its lifecycle and the
// content bridge to the overlay window. The overlay itself is rendered by
// Teleprompter.tsx in a separate webview keyed on the "teleprompter" label.
const LABEL = "teleprompter";
const WIDTH = 560;
const HEIGHT = 200;

// Disposers tracked in module scope so close() can tear the bridge down even
// though open()'s locals are long gone.
let readyUnlisten: UnlistenFn | null = null;
let storeUnsub: (() => void) | null = null;

/** Open the overlay if closed, close it if open. */
export async function toggleOverlay(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) {
    await close(existing);
    return;
  }
  await open();
}

async function open(): Promise<void> {
  // The overlay announces readiness once mounted; push the current text then.
  readyUnlisten = await listen("teleprompter:ready", pushText);
  // Re-push whenever the active file or its content changes.
  storeUnsub = useStore.subscribe((s, prev) => {
    if (s.content !== prev.content || s.activePath !== prev.activePath) pushText();
  });
  const { x, y } = overlayOrigin();
  const win = new WebviewWindow(LABEL, {
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
    shadow: false,
    transparent: true,
    width: WIDTH,
    height: HEIGHT,
    x,
    y,
  });
  // Wait for the native window to exist before asking Rust to convert it into a
  // non-activating NSPanel: setup_overlay's get_webview_window would otherwise
  // miss it and the overlay would stay a focus-stealing normal window.
  await new Promise<void>((resolve, reject) => {
    void win.once("tauri://created", () => resolve());
    void win.once("tauri://error", (e) => reject(new Error(String(e.payload))));
  });
  await invoke("setup_overlay");
  // Self-close (the bar's ✕, or Esc where the panel takes focus) destroys the
  // window without going through close(); tear the bridge down on destroy so the
  // store subscription and ready listener never leak.
  void win.once("tauri://destroyed", () => teardown());
}

async function close(win: WebviewWindow): Promise<void> {
  await win.close();
  teardown();
}

function teardown(): void {
  storeUnsub?.();
  storeUnsub = null;
  readyUnlisten?.();
  readyUnlisten = null;
}

function pushText(): void {
  void emit("teleprompter:set", { text: mdToText(useStore.getState().content) });
}

// Top-center of the available screen; y=0 parks it in the notch zone.
function overlayOrigin(): { x: number; y: number } {
  const availWidth = typeof screen !== "undefined" ? screen.availWidth : WIDTH;
  return { x: Math.round((availWidth - WIDTH) / 2), y: 0 };
}
