import { Channel, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export const scanTree = (root: string): Promise<string[]> =>
  invoke<string[]>("scan_tree", { root });
export const readFile = (path: string): Promise<string> => invoke<string>("read_file", { path });
export const writeFile = (path: string, content: string): Promise<void> =>
  invoke<void>("write_file", { path, content });
export const watchFolder = (root: string): Promise<void> => invoke<void>("watch_folder", { root });
export const takePendingOpen = (): Promise<string[]> => invoke<string[]>("take_pending_open");
export const isDefaultMarkdownHandler = (): Promise<boolean> =>
  invoke<boolean>("is_default_markdown_handler");
export const setDefaultMarkdownHandler = (): Promise<void> =>
  invoke<void>("set_default_markdown_handler");

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

export async function pickSavePath(): Promise<string | null> {
  const sel = await save({
    defaultPath: "untitled.md",
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
