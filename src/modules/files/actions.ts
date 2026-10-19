// File actions shared by the native menu commands, the welcome screen, the
// sidebar and drag & drop. Everything reads and writes the one app store.
// Rule: anything that leaves the open note flushes it first, and stops if the
// save failed, so edits are never dropped on the way out.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pushRecent, removeRecent } from "@/lib/recent";
import type { PathKind } from "@/lib/tauri";
import {
  confirmAction,
  pathKind,
  pickFile,
  pickFolder,
  pickSavePath,
  readFile,
  renamePath,
  revealPath,
  scanTree,
  trashPath,
  watchFolder,
  writeFile,
} from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { useStore } from "@/state/store";
import { createAutosave } from "./autosave";
import { splitPath } from "./path";

export const AUTOSAVE_MS = 800;

let inflight: Promise<boolean> | null = null;

async function settle(): Promise<void> {
  while (inflight) await inflight;
}

async function write(abs: string, content: string, silent: boolean): Promise<boolean> {
  useStore.getState().setSaving(true);
  try {
    await writeFile(abs, content);
    useStore.getState().markSaved(content);
    useStore.getState().setSaving(false);
    if (!silent) toast.success("Saved");
    return true;
  } catch (e) {
    useStore.getState().setSaving(false, true);
    toast.error(`Save failed: ${e}`);
    return false;
  }
}

/**
 * Writes the open note if it has changes. One write at a time: a second call
 * (⌘S from the menu and the editor at once) waits and then finds nothing to do.
 * Resolves false only when a write failed; nothing to save counts as saved.
 */
export async function save({ silent = true } = {}): Promise<boolean> {
  await settle();
  const { root, activePath, content, dirty } = useStore.getState();
  if (!root || !activePath || !dirty) return true;
  inflight = write(`${root}/${activePath}`, content, silent);
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export const autosave = createAutosave(() => save(), AUTOSAVE_MS);

/** Saves a short pause after typing stops. Returns the unsubscribe. */
export function installAutosave(): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.content !== prev.content && s.dirty) autosave.schedule();
  });
}

async function watch(root: string): Promise<void> {
  try {
    await watchFolder(root);
  } catch {
    toast.warning("Opened, but live reload is unavailable.");
  }
}

async function rescan(root: string): Promise<void> {
  const { single, files } = useStore.getState();
  useStore.getState().setFolder(root, single ? files : await scanTree(root), single);
}

/** Opens a note of the open folder by its relative path. */
export async function openNote(rel: string): Promise<void> {
  const { root, activePath } = useStore.getState();
  if (!root || rel === activePath) return;
  if (!(await autosave.flush())) return;
  try {
    useStore.getState().setActive(rel, await readFile(`${root}/${rel}`));
  } catch (e) {
    toast.error(String(e));
  }
}

/** Opens a folder of notes. `quiet` skips error toasts (session restore). */
export async function openFolder(root: string, quiet = false): Promise<boolean> {
  if (!(await autosave.flush())) return false;
  let files: string[];
  try {
    files = await scanTree(root);
  } catch (e) {
    if (!quiet) toast.error(String(e));
    return false;
  }
  useStore.getState().setFolder(root, files);
  pushRecent(root);
  await watch(root);
  return true;
}

/**
 * Opens one Markdown file by absolute path. Inside the open folder it opens as
 * a note of that folder; otherwise the sidebar shows just this file, scoped to
 * its parent so save and live reload keep the same root + relative model.
 */
export async function openFile(file: string, quiet = false): Promise<boolean> {
  const { root, single } = useStore.getState();
  if (root && !single && (file.startsWith(`${root}/`) || file.startsWith(`${root}\\`))) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    try {
      await rescan(root);
    } catch (e) {
      if (!quiet) toast.error(String(e));
      return false;
    }
    await openNote(rel);
    pushRecent(file);
    return useStore.getState().activePath === rel;
  }
  if (!(await autosave.flush())) return false;
  const { dir, name } = splitPath(file);
  const parent = dir.length > 1 ? dir.slice(0, -1) : dir || ".";
  try {
    const content = await readFile(file);
    useStore.getState().setFolder(parent, [name], true);
    useStore.getState().setActive(name, content);
  } catch (e) {
    if (!quiet) toast.error(String(e));
    return false;
  }
  pushRecent(file);
  await watch(parent);
  return true;
}

/** Opens whatever is at `abs` (recent item, dropped item). Gone paths leave Open Recent. */
export async function openPath(abs: string): Promise<void> {
  const { name } = splitPath(abs.replace(/[\\/]+$/, ""));
  let kind: PathKind;
  try {
    kind = await pathKind(abs);
  } catch (e) {
    toast.error(String(e));
    return;
  }
  if (kind === "missing") {
    removeRecent(abs);
    toast.warning(`“${name}” is no longer there.`, { description: "Removed from Open Recent." });
  } else if (kind === "dir") {
    await openFolder(abs);
  } else if (/\.(md|markdown)$/i.test(name)) {
    await openFile(abs);
  } else {
    toast.warning("Tapa opens Markdown (.md) files and folders.");
  }
}

export async function openFileDialog(): Promise<void> {
  const file = await pickFile();
  if (file) await openFile(file);
}

export async function openFolderDialog(): Promise<void> {
  const root = await pickFolder();
  if (root) await openFolder(root);
}

/** Asks where to save, writes a blank note there, then opens it. */
export async function newFile(): Promise<void> {
  const { root } = useStore.getState();
  const path = await pickSavePath(root ? `${root}/untitled.md` : undefined);
  if (!path) return;
  try {
    await writeFile(path, "");
  } catch (e) {
    toast.error(String(e));
    return;
  }
  await openFile(path);
}

/** Writes the note under a new name and opens that copy. The old file keeps what it had on disk. */
export async function saveAs(): Promise<void> {
  const { root, activePath } = useStore.getState();
  if (!root || !activePath) return;
  const from = `${root}/${activePath}`;
  const to = await pickSavePath(from);
  if (!to) return;
  if (to === from) {
    await save({ silent: false });
    return;
  }
  autosave.cancel();
  await settle();
  try {
    await writeFile(to, useStore.getState().content);
  } catch (e) {
    toast.error(`Save failed: ${e}`);
    return;
  }
  // The unsaved edits now live in the copy; drop them here so the old file is not written.
  useStore.getState().closeNote();
  if (await openFile(to)) toast.success(`Saved as ${splitPath(to).name}`);
}

/**
 * Renames the open note inside its folder and keeps it open. A name without an
 * extension keeps the old one. Resolves an error message for the dialog, or null.
 */
export async function renameNote(input: string): Promise<string | null> {
  const { root, activePath, single } = useStore.getState();
  if (!root || !activePath) return null;
  let name = input.trim();
  if (!name) return "Type a name.";
  if (/[\\/]/.test(name)) return "A name can't contain / or \\.";
  const from = `${root}/${activePath}`;
  const { dir, name: oldName } = splitPath(from);
  const dot = oldName.lastIndexOf(".");
  if (!name.includes(".") && dot > 0) name += oldName.slice(dot);
  if (name === oldName) return null;
  if (!(await autosave.flush())) return "Couldn't save the note first.";
  const to = dir + name;
  try {
    await renamePath(from, to);
  } catch (e) {
    return String(e);
  }
  const rel = activePath.slice(0, activePath.length - oldName.length) + name;
  useStore.getState().moveActive(rel);
  if (single) {
    useStore.getState().setFolder(root, [rel], true);
    removeRecent(from);
    pushRecent(to);
  } else {
    try {
      await rescan(root);
    } catch (e) {
      toast.error(String(e));
    }
  }
  return null;
}

export async function revealNote(): Promise<void> {
  const { root, activePath } = useStore.getState();
  if (!root) return;
  try {
    await revealPath(activePath ? `${root}/${activePath}` : root);
  } catch (e) {
    toast.error(String(e));
  }
}

/** Asks first, then moves the note to the OS trash (never a permanent delete). */
export async function trashNote(): Promise<void> {
  const { root, activePath, single } = useStore.getState();
  if (!root || !activePath) return;
  const abs = `${root}/${activePath}`;
  const { name } = splitPath(abs);
  const ok = await confirmAction(`Move “${name}” to the Trash?`, "Move to Trash", "Move to Trash");
  if (!ok) return;
  autosave.cancel();
  await settle();
  try {
    await trashPath(abs);
  } catch (e) {
    toast.error(String(e));
    return;
  }
  if (single) {
    removeRecent(abs);
    useStore.getState().clearFolder();
  } else {
    useStore.getState().closeNote();
    try {
      await rescan(root);
    } catch {
      // The watcher rescans on the next change.
    }
  }
  toast.success(`Moved “${name}” to the Trash.`);
}

/** Closes the note after saving it; the folder stays. With no note open, closes the window. */
export async function closeNote(): Promise<void> {
  if (!useStore.getState().activePath) {
    try {
      await getCurrentWindow().close();
    } catch {
      // No Tauri runtime: nothing to close.
    }
    return;
  }
  if (await autosave.flush()) useStore.getState().closeNote();
}

// --- Session: reopen the last folder (or file) and note on launch ----------

const SESSION_KEY = "tapa-session";

interface Session {
  root: string;
  single: boolean;
  note: string | null;
}

/** Keeps the last open folder/file and note in localStorage. Returns the unsubscribe. */
export function rememberSession(): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.root === prev.root && s.single === prev.single && s.activePath === prev.activePath) {
      return;
    }
    try {
      if (!s.root) localStorage.removeItem(SESSION_KEY);
      else {
        const session: Session = { root: s.root, single: s.single, note: s.activePath };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
    } catch {
      // Storage blocked: the next launch starts empty.
    }
  });
}

/** Reopens the last session. Anything missing is skipped without a message. */
export async function restoreSession(): Promise<void> {
  let s: Partial<Session> | null;
  try {
    s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return;
  }
  if (!s || typeof s.root !== "string") return;
  const note = typeof s.note === "string" ? s.note : null;
  if (s.single) {
    if (note) await openFile(`${s.root}/${note}`, true);
    return;
  }
  if (!(await openFolder(s.root, true))) return;
  if (note && useStore.getState().files.includes(note)) await openNote(note);
}
