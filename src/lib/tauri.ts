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
/** Where an earlier copy of a note came from: the Git `HEAD`, or the copy Tapa kept when the note was opened. */
export type PreviousVersion = { source: "git" | "saved"; text: string };
export const previousVersion = (path: string): Promise<PreviousVersion | null> =>
  invoke<PreviousVersion | null>("previous_version", { path });
/** Keeps the file's current text as Tapa's copy of the note as opened, replacing any earlier copy. */
export const rememberVersion = (path: string): Promise<void> =>
  invoke<void>("remember_version", { path });
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

// Optional AI continuation. The key goes into the OS keychain from Rust and is
// never sent back; the webview only learns whether one is saved.
export type AiProvider = "openai" | "anthropic";
export interface AiStatus {
  enabled: boolean;
  provider: AiProvider;
  /** Blank means the provider's default model. */
  model: string;
  hasKey: boolean;
  defaultModels: Record<AiProvider, string>;
}
/** Why `aiComplete` failed, as sent by Rust. */
export type AiError =
  | {
      kind:
        | "off"
        | "noKey"
        | "badKey"
        | "rateLimited"
        | "timeout"
        | "network"
        | "badResponse"
        | "keychain"
        | "config";
    }
  | { kind: "provider"; status: number };
export const aiStatus = (): Promise<AiStatus> => invoke<AiStatus>("ai_status");
export const aiSaveSettings = (s: {
  enabled: boolean;
  provider: AiProvider;
  model: string;
}): Promise<AiStatus> => invoke<AiStatus>("ai_save_settings", s);
export const aiSetKey = (key: string): Promise<AiStatus> => invoke<AiStatus>("ai_set_key", { key });
export const aiClearKey = (): Promise<AiStatus> => invoke<AiStatus>("ai_clear_key");
/** One short continuation of the text at the caret, or null. Rejects with an `AiError`. */
export const aiComplete = (before: string, after: string): Promise<string | null> =>
  invoke<string | null>("ai_complete", { before, after });

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
