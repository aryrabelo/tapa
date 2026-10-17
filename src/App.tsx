import { PanelLeft, Settings } from "@/components/ui/icons";
import type * as React from "react";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { Button } from "@/components/ui/button";
import {
  createPath,
  pickFolder,
  pickSavePath,
  readFile,
  scanTree,
  watchFolder,
  writeFile,
} from "@/lib/tauri";
import { onToasterNeeded, toast } from "@/lib/toast";
import { useStore } from "@/state/store";
import { registry, useActivePanel } from "@/lib/registry";
import { useSearch } from "@/modules/search/useSearch";
import { useFind } from "@/modules/find/useFind";
import { useFileWatcher } from "@/lib/useFileWatcher";
import { useOsOpen } from "@/lib/useOsOpen";
import { useNewFile } from "@/lib/useNewFile";
import { bootCorePlugins } from "@/lib/plugins";
import { ContextMenu } from "@/components/ContextMenu";

// Commands and settings load with the shell. Editor plugins wait until a note opens.
void bootCorePlugins();

// CodeMirror loads with the first note, not with the empty screen.
const Editor = lazy(() =>
  import("@/components/editor/Editor").then((m) => ({ default: m.Editor })),
);

// The folder tree only shows once a folder is open.
const AppSidebar = lazy(() =>
  import("@/components/layout/AppSidebar").then((m) => ({ default: m.AppSidebar })),
);

// sonner's <Toaster> (~9KB gzip) is mounted on first toast, not at startup.
const Toaster = lazy(() => import("sonner").then((m) => ({ default: m.Toaster })));

const SearchPanel = lazy(() =>
  import("@/modules/search/SearchPanel").then((m) => ({ default: m.SearchPanel })),
);

const FindBar = lazy(() => import("@/modules/find/FindBar").then((m) => ({ default: m.FindBar })));

const SettingsPanel = lazy(() =>
  import("@/modules/settings/SettingsPanel").then((m) => ({ default: m.SettingsPanel })),
);

export default function App(): React.ReactElement {
  const s = useStore();
  const [toasterReady, setToasterReady] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    onToasterNeeded(() => setToasterReady(true));
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof localStorage === "undefined" || localStorage.getItem("tapa-sidebar") !== "closed",
  );

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tapa-sidebar", sidebarOpen ? "open" : "closed");
    }
  }, [sidebarOpen]);

  // ⌘B / Ctrl-B toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activePanelId = useActivePanel();
  const search = useSearch(openFile);
  const find = useFind();
  useFileWatcher();

  // One app-wide keybinding dispatcher: routes a registered command's keybinding
  // through the registry. Plain typing (no ⌘/Ctrl) early-returns, so the hot
  // editor path costs one boolean — no per-keystroke allocation or scan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (registry.runKeybinding(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openFolder() {
    const root = await pickFolder();
    if (!root) return;
    try {
      const files = await scanTree(root);
      useStore.getState().setFolder(root, files);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    try {
      await watchFolder(root);
    } catch {
      toast.warning("Folder opened, but live reload is unavailable.");
    }
  }

  // Open a single Markdown file by absolute path: scope the "folder" to its
  // parent so the sidebar shows just this file and save/watch keep working with
  // the same root+rel model. Shared by the OS file-open path.
  const openFileByPath = useCallback(async (file: string) => {
    const sep = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
    const parent = sep > 0 ? file.slice(0, sep) : sep === 0 ? "/" : ".";
    const base = file.slice(sep + 1);
    try {
      const content = await readFile(file);
      useStore.getState().setFolder(parent, [base]);
      useStore.getState().setActive(base, content);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    try {
      await watchFolder(parent);
    } catch {
      toast.warning("File opened, but live reload is unavailable.");
    }
  }, []);

  // Native "New File" menu (⌘N): pick a save location, write a blank file, then
  // open it. No in-memory untitled buffer, so the path-based save model stays simple.
  const newFile = useCallback(async () => {
    const path = await pickSavePath();
    if (!path) return;
    try {
      await writeFile(path, "");
    } catch (e) {
      toast.error(String(e));
      return;
    }
    await openFileByPath(path);
  }, [openFileByPath]);

  // Sidebar "+": create a new file or directory relative to the open folder
  // (no native Save dialog). An empty directory appears once it holds a note.
  const createEntry = useCallback(async (rel: string, dir: boolean) => {
    const { root } = useStore.getState();
    if (!root || !rel) return;
    try {
      await createPath(`${root}/${rel}`, dir);
      const files = await scanTree(root);
      useStore.getState().setFolder(root, files);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    if (dir) {
      toast.success("Folder created — it appears once it has a note.");
    } else {
      useStore.getState().setActive(rel, "");
    }
  }, []);

  async function openFile(rel: string) {
    const { root } = useStore.getState();
    if (!root) return;
    try {
      const content = await readFile(`${root}/${rel}`);
      useStore.getState().setActive(rel, content);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function save(silent = false): Promise<boolean> {
    const { root, activePath, content } = useStore.getState();
    if (!root || !activePath) return false;
    setSaving(true);
    try {
      await writeFile(`${root}/${activePath}`, content);
      useStore.getState().markSaved();
      if (!silent) toast.success("Saved");
      return true;
    } catch (e) {
      toast.error(`Save failed: ${e}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Blur autosaves only when dirty. The header status is the confirmation.
  const saveOnBlur = async (): Promise<boolean> => {
    if (!useStore.getState().dirty) return false;
    return await save(true);
  };

  useOsOpen(openFileByPath);
  useNewFile(newFile);

  const docTitle = s.activePath?.split(/[/\\]/).filter(Boolean).pop() ?? null;
  const saveStatus = !s.activePath ? null : saving ? "Saving…" : s.dirty ? "Unsaved" : "Saved";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {toasterReady && (
        <Suspense fallback={null}>
          <Toaster position="bottom-right" />
        </Suspense>
      )}
      <CommandPalette files={s.files} onPick={openFile} onOpenPath={openFileByPath} />
      <ContextMenu />
      {activePanelId === "search" && (
        <Suspense fallback={null}>
          <SearchPanel
            open
            hits={search.hits}
            query={search.query}
            onQueryChange={search.setQuery}
            onPick={search.pick}
            onClose={search.close}
          />
        </Suspense>
      )}
      {activePanelId === "find" && (
        <Suspense fallback={null}>
          <FindBar
            query={find.query}
            onQueryChange={find.setQuery}
            count={find.count}
            current={find.current}
            onNext={find.next}
            onPrev={find.prev}
            onClose={find.close}
          />
        </Suspense>
      )}
      {activePanelId === "settings" && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => registry.runCommand("settings.close")} />
        </Suspense>
      )}
      {sidebarOpen && (
        <Suspense fallback={null}>
          <AppSidebar
            tree={s.tree}
            active={s.activePath}
            onPick={openFile}
            onNewFile={newFile}
            onCreate={createEntry}
          />
        </Suspense>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              title={sidebarOpen ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <PanelLeft className="size-4" />
            </Button>
            <span className="truncate text-sm font-medium text-foreground">
              {docTitle ?? "Tapa"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {saveStatus}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Settings"
              title="Settings (⌘,)"
              onClick={() => void registry.runCommand("settings.open")}
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          {!s.activePath && !s.root && (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
              <span className="font-serif text-4xl tracking-tight text-muted-foreground">Tapa</span>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Open a folder of notes. Each one opens ready to edit.
              </p>
              <Button size="sm" onClick={openFolder}>
                Open my folder
              </Button>
            </div>
          )}
          {!s.activePath && s.root && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Select a file from the sidebar, or press ⌘K to jump between files.
              </p>
            </div>
          )}
          {s.activePath && (
            <Suspense fallback={null}>
              <Editor
                key={s.activePath}
                doc={s.content}
                cursor={s.editOffset ?? 0}
                onChange={(d) => useStore.getState().setContent(d)}
                onSave={() => void save()}
                onBlurSave={saveOnBlur}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
