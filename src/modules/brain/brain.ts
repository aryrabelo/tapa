import { getPluginConfigValue } from "@/lib/plugin-config";
import { ensureBrain, scanTree, watchFolder, writeFile } from "@/lib/tauri";
import { leaveNote } from "@/modules/files/actions";
import { useStore } from "@/state/store";

// Open the git-backed ideas vault: ensure it exists on disk, scan it into the
// folder tree, and start watching for live changes. The vault directory is
// configurable per-plugin; a blank/unset value defaults to ~/brain. The open
// note is saved first, like any other root switch.
export async function openBrain(): Promise<void> {
  const dir = getPluginConfigValue("brain", "dir") || undefined;
  const root = await ensureBrain(dir);
  const opened = await leaveNote(
    () => scanTree(root),
    (files) => useStore.getState().setFolder(root, files, false),
  );
  if (!opened) return;
  try {
    await watchFolder(root);
  } catch {}
}

// Capture a fresh idea into the vault's inbox: write a seeded note, open the
// folder + the new note, and drop the cursor just after the "# " title.
export async function captureIdea(): Promise<void> {
  const dir = getPluginConfigValue("brain", "dir") || undefined;
  const root = await ensureBrain(dir);
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const rel = `inbox/${date}-${hash}.md`;
  const seed = `---\ncreated: ${now}\ntags: [inbox]\n---\n# Untitled\n\n## Compiled truth\n\n\n## Timeline\n- ${date} — captured\n`;
  const opened = await leaveNote(
    async () => {
      await writeFile(`${root}/${rel}`, seed);
      return scanTree(root);
    },
    (files) => {
      useStore.getState().setFolder(root, files, false);
      useStore.getState().setActive(rel, seed, seed.indexOf("# ") + 2);
    },
  );
  if (!opened) return;
  try {
    await watchFolder(root);
  } catch {}
}
