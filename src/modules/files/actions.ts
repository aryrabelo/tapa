// File actions shared by the native menu commands, the welcome screen, the
// sidebar and drag & drop. Everything reads and writes the one app store.
// Rule: anything that replaces or drops the open note goes through `leaveNote`,
// so edits are never dropped on the way out.
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
  rememberVersion,
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

/**
 * Reads a note to open it, and asks Rust to keep the text on disk as "the note
 * as it was when opened" for the What changed panel. Fire and forget: that panel
 * is optional. It is dispatched before the read returns, so it precedes any save
 * of this note.
 */
function readNote(abs: string): Promise<string> {
  void Promise.resolve(rememberVersion(abs)).catch(() => {});
  return readFile(abs);
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

export const autosave = createAutosave(
  () => save(),
  () => {
    const { root, activePath, dirty } = useStore.getState();
    return Boolean(root && activePath && dirty);
  },
  AUTOSAVE_MS,
);

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

/** Re-reads the tree of the open root, keeping its mode (a single file keeps its list). */
export async function rescan(root: string): Promise<void> {
  const { single, files } = useStore.getState();
  useStore.getState().setFolder(root, single ? files : await scanTree(root), single);
}

// Transitions run one at a time, so two opens never interleave their commits.
let queue: Promise<unknown> = Promise.resolve();

/**
 * The one way to replace or drop the open note. Saves it, runs `load` (the I/O
 * for what comes next), saves whatever was typed meanwhile, then runs `commit`
 * in the same tick, so no keystroke lands between the last save and the switch.
 * `flush` is where the edits go: the note itself, or the Save As copy.
 * Resolves false, committing nothing, when a save failed; `load` errors reject.
 */
export function leaveNote<T>(
  load: () => Promise<T>,
  commit: (value: T) => void,
  flush: () => Promise<boolean> = () => autosave.flush(),
): Promise<boolean> {
  const run = queue.then(async () => {
    if (!(await flush())) return false;
    const value = await load();
    if (!(await flush())) return false;
    commit(value);
    return true;
  });
  queue = run.catch(() => {});
  return run;
}

/** Opens a note of the open folder by its relative path. */
export async function openNote(rel: string): Promise<void> {
  const { root, activePath } = useStore.getState();
  if (!root || rel === activePath) return;
  try {
    await leaveNote(
      () => readNote(`${root}/${rel}`),
      (content) => {
        // A transition queued before this one may have switched the root.
        if (useStore.getState().root === root) useStore.getState().setActive(rel, content);
      },
    );
  } catch (e) {
    toast.error(String(e));
  }
}

/** Opens a folder of notes. `quiet` skips error toasts (session restore). */
export async function openFolder(root: string, quiet = false): Promise<boolean> {
  try {
    const opened = await leaveNote(
      () => scanTree(root),
      (files) => useStore.getState().setFolder(root, files, false),
    );
    if (!opened) return false;
  } catch (e) {
    if (!quiet) toast.error(String(e));
    return false;
  }
  pushRecent(root);
  await watch(root);
  return true;
}

/** `file` relative to the open folder, or null when it lives elsewhere (or a single file is open). */
function relInFolder(file: string): string | null {
  const { root, single } = useStore.getState();
  if (!root || single || !(file.startsWith(`${root}/`) || file.startsWith(`${root}\\`))) {
    return null;
  }
  return file.slice(root.length + 1).replace(/\\/g, "/");
}

/** The folder holding `file`, used as the root of a single-file session. */
function parentOf(file: string): { parent: string; name: string } {
  const { dir, name } = splitPath(file);
  return { parent: dir.length > 1 ? dir.slice(0, -1) : dir || ".", name };
}

/**
 * Opens one Markdown file by absolute path. Inside the open folder it opens as
 * a note of that folder; otherwise the sidebar shows just this file, scoped to
 * its parent so save and live reload keep the same root + relative model.
 */
export async function openFile(file: string, quiet = false): Promise<boolean> {
  const rel = relInFolder(file);
  const root = useStore.getState().root;
  if (rel && root) {
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
  const { parent, name } = parentOf(file);
  try {
    const opened = await leaveNote(
      () => readNote(file),
      (content) => {
        useStore.getState().setFolder(parent, [name], true);
        useStore.getState().setActive(name, content);
      },
    );
    if (!opened) return false;
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
  // The edits go to the copy, again for anything typed during a write; the
  // old file is never written. A failed write leaves the note open as it was.
  let copied: string | null = null;
  const writeCopy = async (): Promise<boolean> => {
    while (useStore.getState().content !== copied) {
      autosave.cancel();
      const text = useStore.getState().content;
      try {
        await writeFile(to, text);
      } catch (e) {
        toast.error(`Save failed: ${e}`);
        return false;
      }
      copied = text;
    }
    return true;
  };
  const rel = relInFolder(to);
  const { parent, name } = parentOf(to);
  try {
    const opened = await leaveNote(
      () => (rel ? scanTree(root) : Promise.resolve([name])),
      (files) => {
        const text = useStore.getState().content;
        useStore.getState().setFolder(rel ? root : parent, files, !rel);
        useStore.getState().setActive(rel ?? name, text);
      },
      writeCopy,
    );
    if (!opened) return;
  } catch (e) {
    toast.error(String(e));
    return;
  }
  void Promise.resolve(rememberVersion(to)).catch(() => {});
  pushRecent(to);
  if (!rel) await watch(parent);
  toast.success(`Saved as ${name}`);
}

/**
 * Renames the open note inside its folder and keeps it open. A name without
 * .md/.markdown gets the old extension. Resolves an error message for the dialog, or null.
 */
export async function renameNote(input: string): Promise<string | null> {
  const { root, activePath, single } = useStore.getState();
  if (!root || !activePath) return null;
  let name = input.trim();
  if (!name) return "Type a name.";
  if (/[\\/]/.test(name)) return "A name can't contain / or \\.";
  const from = `${root}/${activePath}`;
  const { dir, name: oldName } = splitPath(from);
  // Keep the Markdown extension unless the name already has one ("Meeting 3.5" → "Meeting 3.5.md").
  if (!/\.(md|markdown)$/i.test(name)) {
    name += oldName.match(/\.(md|markdown)$/i)?.[0] ?? ".md";
  }
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

/** Asks first, saves, then moves the note to the OS trash (never a permanent delete). */
export async function trashNote(): Promise<void> {
  const { root, activePath, single } = useStore.getState();
  if (!root || !activePath) return;
  const abs = `${root}/${activePath}`;
  const { name } = splitPath(abs);
  const ok = await confirmAction(`Move “${name}” to the Trash?`, "Move to Trash", "Move to Trash");
  if (!ok) return;
  // The Trash gets the latest text. Edits typed while it moves are saved back
  // at the old path rather than dropped.
  try {
    const trashed = await leaveNote(
      () => trashPath(abs),
      () => {
        if (single) useStore.getState().clearFolder();
        else useStore.getState().closeNote();
      },
    );
    if (!trashed) {
      toast.error(`“${name}” was not moved to the Trash because it could not be saved.`);
      return;
    }
  } catch (e) {
    toast.error(String(e));
    return;
  }
  if (single) {
    removeRecent(abs);
  } else {
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
  await leaveNote(
    () => Promise.resolve(),
    () => useStore.getState().closeNote(),
  );
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

/**
 * Reopens the last session. Anything missing is skipped without a message.
 * Stops between steps once `signal` aborts (the OS handed over a file to open);
 * transitions are queued, so the OS file opens after any step already running.
 */
export async function restoreSession(signal?: AbortSignal): Promise<void> {
  let s: Partial<Session> | null;
  try {
    s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return;
  }
  if (!s || typeof s.root !== "string" || signal?.aborted) return;
  const note = typeof s.note === "string" ? s.note : null;
  if (s.single) {
    if (note) await openFile(`${s.root}/${note}`, true);
    return;
  }
  if (!(await openFolder(s.root, true)) || signal?.aborted) return;
  if (note && useStore.getState().files.includes(note)) await openNote(note);
}
