import { PanelLeft } from "@/components/ui/icons";
import type * as React from "react";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { pickFile, pickFolder, readFile, scanTree, watchFolder, writeFile } from "@/lib/tauri";
import { onToasterNeeded, toast } from "@/lib/toast";
import { useStore } from "@/state/store";
import { registry, useActivePanel } from "@/lib/registry";
import { searchModule } from "@/modules/search";
import { defaultHandlerModule } from "@/modules/default-handler";
import { updaterModule } from "@/modules/updater";
import { useSearch } from "@/modules/search/useSearch";
import { findModule } from "@/modules/find";
import { useFind } from "@/modules/find/useFind";
import { useFileWatcher } from "@/lib/useFileWatcher";
import { useOsOpen } from "@/lib/useOsOpen";
import { presentationModule } from "@/modules/presentation";
import { livewriteModule } from "@/modules/livewrite";
import { ContextMenu } from "@/components/ContextMenu";

// codemirror (~169KB gzip) is only used in edit mode. Load it on demand so the
// reader-first startup bundle stays lean (smaller webview memory + faster boot).
const Editor = lazy(() =>
  import("@/components/editor/Editor").then((m) => ({ default: m.Editor })),
);

// react-markdown + the remark/micromark stack (~47KB gzip) only renders once a
// file is open; the app boots to an empty state. Load it on demand too.
const Reader = lazy(() =>
  import("@/components/reader/Reader").then((m) => ({ default: m.Reader })),
);

// The folder tree (radix ScrollArea + tree icons) only shows once a folder is
// open; defer it so the empty-state cold start stays light.
const AppSidebar = lazy(() =>
  import("@/components/layout/AppSidebar").then((m) => ({ default: m.AppSidebar })),
);

// sonner's <Toaster> (~9KB gzip) is mounted on first toast, not at startup.
const Toaster = lazy(() => import("sonner").then((m) => ({ default: m.Toaster })));

// Search is the first registry module; register it once at module load so the
// ⌘⇧F command exists eagerly. The panel body is lazy-loaded on first open.
registry.register(searchModule);
registry.register(findModule);

// Reader plugins: register their ⌘⇧P / ⌘⇧L commands eagerly, then activate them
// now so their right-click menu items exist before the first command ever runs.
registry.register(presentationModule);
registry.register(livewriteModule);
void registry.activate("presentation");
void registry.activate("livewrite");
registry.register(defaultHandlerModule);
void registry.activate("default-handler");
registry.register(updaterModule);
void registry.activate("updater");

const SearchPanel = lazy(() =>
  import("@/modules/search/SearchPanel").then((m) => ({ default: m.SearchPanel })),
);

const FindBar = lazy(() => import("@/modules/find/FindBar").then((m) => ({ default: m.FindBar })));

export default function App(): React.ReactElement {
  const s = useStore();
  // Mount the lazy <Toaster> only the first time a toast is requested.
  const [toasterReady, setToasterReady] = useState(false);
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
    // Watch failures are isolated: the folder is already open and populated, so
    // surface a distinct message instead of letting it look like an open failure.
    try {
      await watchFolder(root);
    } catch {
      toast.warning("Folder opened, but live reload is unavailable.");
    }
  }

  // Open a single Markdown file by absolute path: scope the "folder" to its
  // parent so the sidebar shows just this file and save/watch keep working with
  // the same root+rel model. Shared by the file dialog and OS file-open.
  const openFileByPath = useCallback(async (file: string) => {
    const sep = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
    // sep > 0: normal parent dir; sep === 0: file at filesystem root ("/x.md" -> "/");
    // sep < 0: bare name with no separator (parent is the current dir ".").
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

  async function openSingleFile() {
    const file = await pickFile();
    if (!file) return;
    await openFileByPath(file);
  }

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

  async function save(): Promise<boolean> {
    const { root, activePath, content } = useStore.getState();
    if (!root || !activePath) return false;
    try {
      await writeFile(`${root}/${activePath}`, content);
      useStore.getState().markSaved();
      toast.success("Saved");
      return true;
    } catch (e) {
      // Editor stays open and dirty is preserved so the user can retry.
      toast.error(`Save failed: ${e}`);
      return false;
    }
  }

  // ⌘S and double-click share one handler: save, then return to the reader on
  // success. A failed save returns false, leaving the editor open and dirty.
  const exitOnSave = async (): Promise<void> => {
    if (await save()) useStore.getState().exitEdit();
  };

  useOsOpen(openFileByPath);

  const folderName = s.root ? (s.root.split(/[/\\]/).filter(Boolean).pop() ?? null) : null;

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
      {s.tree.length > 0 && sidebarOpen && (
        <Suspense fallback={null}>
          <AppSidebar tree={s.tree} active={s.activePath} onPick={openFile} />
        </Suspense>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            {s.tree.length > 0 && (
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
            )}
            <span className="truncate text-sm font-medium text-foreground">
              {folderName ?? "Tapa"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="mr-1 hidden select-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground sm:inline-block">
              ⌘K
            </kbd>
            <ThemeToggle />
            {s.root && (
              <>
                <Button size="sm" variant="outline" onClick={openSingleFile}>
                  Open File
                </Button>
                <Button size="sm" variant="outline" onClick={openFolder}>
                  Open Folder
                </Button>
              </>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          {!s.activePath && !s.root && (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
              <span className="font-serif text-4xl tracking-tight text-muted-foreground">Tapa</span>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Open a folder, then press ⌘K to jump between files — or open a single file.
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={openFolder}>
                  Open Folder
                </Button>
                <Button size="sm" variant="ghost" onClick={openSingleFile}>
                  Open File
                </Button>
              </div>
            </div>
          )}
          {!s.activePath && s.root && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Select a file from the sidebar, or press ⌘K to jump between files.
              </p>
            </div>
          )}
          {s.activePath && s.mode === "reader" && (
            <Suspense fallback={null}>
              <Reader
                content={s.content}
                path={s.activePath}
                onEditAt={(off) => useStore.getState().enterEdit(off)}
              />
            </Suspense>
          )}
          {s.activePath && s.mode === "edit" && (
            <Suspense fallback={null}>
              <Editor
                doc={s.content}
                cursor={s.editOffset ?? 0}
                onChange={(d) => useStore.getState().setContent(d)}
                onExit={exitOnSave}
                onSave={exitOnSave}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
