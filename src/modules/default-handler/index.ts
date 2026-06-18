import type { Module } from "@/lib/registry";
import { setDefaultMarkdownHandler } from "@/lib/tauri";
import { toast } from "@/lib/toast";

// Lets the user make Tapa the system default Markdown app (macOS LaunchServices;
// returns an error on other platforms). Exposed both as a command and a
// right-click menu item under the "App" group.
async function setDefault(): Promise<void> {
  try {
    await setDefaultMarkdownHandler();
    toast.success("Tapa is now your default Markdown app.");
  } catch (e) {
    toast.error(`Couldn't set Tapa as default: ${String(e)}`);
  }
}

export const defaultHandlerModule: Module = {
  id: "default-handler",
  register(reg) {
    reg.command({
      id: "app.setDefaultMarkdown",
      title: "Set Tapa as the default Markdown app",
      run: () => void setDefault(),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "app.setDefaultMarkdown",
      label: "Set Tapa as default Markdown app",
      group: "App",
      run: () => void setDefault(),
    });
  },
};
