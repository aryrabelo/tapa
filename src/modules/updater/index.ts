import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { Module } from "@/lib/registry";
import { toast } from "@/lib/toast";

// Download + install, then relaunch into the new build. A failure here is
// download/signature verification, not the check. (With the placeholder pubkey
// this is the path that always rejects.)
async function install(update: Update): Promise<void> {
  try {
    toast.success(`Downloading update ${update.version}…`);
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    toast.error(`Update download/verification failed: ${String(e)}`);
  }
}

// Checks GitHub Releases (latest.json) for a newer build via the updater plugin.
// When one exists it downloads + installs, then relaunches into it. Surfaces
// every outcome through the shared toast util. Exposed as a command and a
// right-click menu item under the "App" group, like the default-handler module.
async function checkForUpdates(): Promise<void> {
  let update: Update | null;
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
  await install(update);
}

const LAST_CHECK_KEY = "tapa-update-checked-at";
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long after launch the silent check waits, so it never slows startup. */
export const SILENT_CHECK_DELAY_MS = 5000;

/**
 * The launch-time check: at most once a day, and quiet. Only a found update
 * shows anything — a toast whose Update button runs the same install as the
 * menu command. Failures (offline, server down) are never shown.
 */
export async function checkSilently(now = Date.now()): Promise<void> {
  const last = Number(localStorage.getItem(LAST_CHECK_KEY));
  // A stamp in the future (clock moved back) counts as stale.
  if (now >= last && now - last < DAY_MS) return;
  localStorage.setItem(LAST_CHECK_KEY, String(now));
  // Errors read as "no update": the silent check never reports a failure.
  const update = await check().catch(() => null);
  if (!update) return;
  toast.success(`Tapa ${update.version} is available.`, {
    description: "Update now? Tapa will restart.",
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Update", onClick: () => void install(update) },
    cancel: { label: "Later" },
  });
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
    const timer = setTimeout(() => void checkSilently(), SILENT_CHECK_DELAY_MS);
    ctx.onDispose(() => clearTimeout(timer));
  },
};
