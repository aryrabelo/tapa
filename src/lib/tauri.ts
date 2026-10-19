import { Channel, invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";

export const scanTree = (root: string): Promise<string[]> =>
  invoke<string[]>("scan_tree", { root });
export const ensureBrain = (path?: string): Promise<string> =>
  invoke<string>("ensure_brain", { path: path ?? null });
export const readFile = (path: string): Promise<string> => invoke<string>("read_file", { path });
export const writeFile = (path: string, content: string): Promise<void> =>
  invoke<void>("write_file", { path, content });
export const createPath = (path: string, dir: boolean): Promise<void> =>
  invoke<void>("create_path", { path, dir });
export const watchFolder = (root: string): Promise<void> => invoke<void>("watch_folder", { root });
export const takePendingOpen = (): Promise<string[]> => invoke<string[]>("take_pending_open");
export const isDefaultMarkdownHandler = (): Promise<boolean> =>
  invoke<boolean>("is_default_markdown_handler");
export const setDefaultMarkdownHandler = (): Promise<void> =>
  invoke<void>("set_default_markdown_handler");
export const setRecentMenu = (paths: string[]): Promise<void> =>
  invoke<void>("set_recent_menu", { paths });
export const renamePath = (from: string, to: string): Promise<void> =>
  invoke<void>("rename_path", { from, to });
export const trashPath = (path: string): Promise<void> => invoke<void>("trash_path", { path });
export const revealPath = (path: string): Promise<void> => invoke<void>("reveal_path", { path });
export type PathKind = "file" | "dir" | "missing";
export const pathKind = (path: string): Promise<PathKind> =>
  invoke<PathKind>("path_kind", { path });

/** Native yes/no warning. Resolves true when the user picks `okLabel`. */
export const confirmAction = (message: string, title: string, okLabel: string): Promise<boolean> =>
  ask(message, { title, kind: "warning", okLabel, cancelLabel: "Cancel" });

export async function pickFolder(): Promise<string | null> {
  const sel = await open({ directory: true, multiple: false });
  return typeof sel === "string" ? sel : null;
}

export async function pickFile(): Promise<string | null> {
  const sel = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  return typeof sel === "string" ? sel : null;
}

/** `defaultPath` prefills the dialog (folder and name); a bare name starts in the last folder. */
export async function pickSavePath(defaultPath = "untitled.md"): Promise<string | null> {
  const sel = await save({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  return typeof sel === "string" ? sel : null;
}

export interface SearchHit {
  path: string; // relative path, forward slashes
  line: number; // 1-based
  col: number; // 0-based byte column within the line
  snippet: string;
}

// Streams hits via a Channel. Resolves once the walk is launched; hits arrive
// on `onHit`. A new search (new channel) or GC of this one closes the prior
// channel, which stops the Rust walk.
export function searchContent(
  root: string,
  query: string,
  opts: { regex: boolean },
  onHit: (hit: SearchHit) => void,
): Promise<void> {
  const channel = new Channel<SearchHit>();
  channel.onmessage = onHit;
  return invoke<void>("search_content", { root, query, regex: opts.regex, onHit: channel });
}
