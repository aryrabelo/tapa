import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export const scanTree = (root: string): Promise<string[]> =>
  invoke<string[]>("scan_tree", { root });
export const readFile = (path: string): Promise<string> => invoke<string>("read_file", { path });
export const writeFile = (path: string, content: string): Promise<void> =>
  invoke<void>("write_file", { path, content });
export const watchFolder = (root: string): Promise<void> => invoke<void>("watch_folder", { root });
export const takePendingOpen = (): Promise<string[]> => invoke<string[]>("take_pending_open");

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
