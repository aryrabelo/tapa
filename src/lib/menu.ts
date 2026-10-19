import { listen } from "@tauri-apps/api/event";
import { registry } from "@/lib/registry";
import { toast } from "@/lib/toast";

// The native menu sends one "menu" event whose payload is an item id.
// "recent:<absolute path>" opens that file or folder; any other id is a command.

const RECENT = "recent:";

export function routeMenu(
  id: string,
  openRecent: (path: string) => Promise<void>,
  runCommand: (id: string) => Promise<void>,
): Promise<void> {
  return id.startsWith(RECENT) ? openRecent(id.slice(RECENT.length)) : runCommand(id);
}

/** Listens for native menu clicks. Call once from App; returns the unlisten. */
export function installMenuListener(openRecent: (path: string) => Promise<void>): () => void {
  let off: (() => void) | undefined;
  let cancelled = false;
  try {
    listen<string>("menu", (ev) => {
      void routeMenu(ev.payload, openRecent, (id) => registry.runCommand(id)).catch((e) =>
        toast.error(String(e)),
      );
    })
      .then((un) => {
        if (cancelled) un();
        else off = un;
      })
      .catch(() => {});
  } catch {
    // No Tauri runtime: the native menu does not exist.
  }
  return () => {
    cancelled = true;
    off?.();
  };
}
