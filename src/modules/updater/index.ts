import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { Module } from "@/lib/registry";
import { toast } from "@/lib/toast";

// Checks GitHub Releases (latest.json) for a newer build via the updater plugin.
// When one exists it downloads + installs, then relaunches into it. Surfaces
// every outcome through the shared toast util. Exposed as a command and a
// right-click menu item under the "App" group, like the default-handler module.
async function checkForUpdates(): Promise<void> {
  let update: Awaited<ReturnType<typeof check>>;
  try {
    update = await check();
  } catch (e) {
    toast.error(`Couldn't check for updates: ${String(e)}`);
    return;
  }
  if (!update) {
    toast.success("Tapa is up to date.");
    return;
  }
  // Separate phase: a failure here is download/signature-verification, not the
  // check. (With the placeholder pubkey this is the path that always rejects.)
  try {
    toast.success(`Downloading update ${update.version}…`);
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    toast.error(`Update download/verification failed: ${String(e)}`);
  }
}

export const updaterModule: Module = {
  id: "updater",
  register(reg) {
    reg.command({
      id: "app.checkForUpdates",
      title: "Check for Updates",
      run: () => void checkForUpdates(),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "app.checkForUpdates",
      label: "Check for Updates",
      group: "App",
      run: () => void checkForUpdates(),
    });
  },
};
