import { ensureBrain, scanTree, watchFolder, writeFile } from "@/lib/tauri";
import { useStore } from "@/state/store";

// Open the default git-backed ideas vault (~/brain): ensure it exists on disk,
// scan it into the folder tree, and start watching for live changes.
export async function openBrain(): Promise<void> {
  const root = await ensureBrain();
  const files = await scanTree(root);
  useStore.getState().setFolder(root, files);
  try {
    await watchFolder(root);
  } catch {}
}

// Capture a fresh idea into the vault's inbox: write a seeded note, open the
// folder + the new note, and drop the cursor just after the "# " title.
export async function captureIdea(): Promise<void> {
  const root = await ensureBrain();
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const rel = `inbox/${date}-${hash}.md`;
  const seed = `---\ncreated: ${now}\ntags: [inbox]\n---\n# Untitled\n\n## Compiled truth\n\n\n## Timeline\n- ${date} — captured\n`;
  await writeFile(`${root}/${rel}`, seed);
  const files = await scanTree(root);
  useStore.getState().setFolder(root, files);
  useStore.getState().setActive(rel, seed);
  useStore.getState().enterEdit(seed.indexOf("# ") + 2);
  try {
    await watchFolder(root);
  } catch {}
}
