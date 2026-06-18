import { PanelLeft } from "@/components/ui/icons";
import type * as React from "react";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  pickFile,
  pickFolder,
  readFile,
  scanTree,
  searchContent,
  takePendingOpen,
  watchFolder,
  writeFile,
  type SearchHit,
} from "@/lib/tauri";
import { onToasterNeeded, toast } from "@/lib/toast";
import { useStore } from "@/state/store";
import { registry, useActivePanel } from "@/lib/registry";
import { searchModule } from "@/modules/search";

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

const SearchPanel = lazy(() =>
  import("@/modules/search/SearchPanel").then((m) => ({ default: m.SearchPanel })),
);

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

  // Content search (⌘⇧F) — a registry-driven overlay streaming hits from Rust.
  const activePanelId = useActivePanel();
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void registry.runCommand("search.open");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced streaming search against the open root. A superseded query drops
  // its in-flight hits (alive flag) and lets the prior Channel be GC'd, which
  // stops the Rust walk; results are capped at 100 rows.
  useEffect(() => {
    const { root } = useStore.getState();
    if (!root || !searchQuery) {
      setSearchHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      setSearchHits([]);
      void searchContent(root, searchQuery, { regex: false }, (hit) => {
        if (alive) setSearchHits((prev) => (prev.length >= 100 ? prev : [...prev, hit]));
      });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [searchQuery]);

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

  // Open a search hit: load its file, then ask the reader to scroll to the line.
  async function onSearchPick(hit: SearchHit) {
    await openFile(hit.path);
    useStore.getState().setScrollLine(hit.line);
    void registry.runCommand("search.close");
    setSearchQuery("");
    setSearchHits([]);
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

  // Reloads the active file from disk, discarding the in-memory buffer.
  const reloadActive = useCallback(async () => {
    const { root, activePath } = useStore.getState();
    if (!root || !activePath) return;
    try {
      const c = await readFile(`${root}/${activePath}`);
      useStore.getState().setActive(activePath, c);
    } catch (e) {
      toast.error(String(e));
    }
  }, []);

  // External change handling (reload if clean; offer a choice if dirty).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    try {
      listen<string[]>("file-changed", async (ev) => {
        const { root, activePath, dirty } = useStore.getState();
        if (!root || !activePath) return;
        // The Rust watcher emits native paths (backslashes on Windows); normalize
        // separators on both sides so the comparison matches cross-platform.
        const abs = `${root}/${activePath}`;
        const normalize = (p: string): string => p.replace(/\\/g, "/");
        const absNorm = normalize(abs);
        if (!ev.payload.some((p) => normalize(p) === absNorm)) return;
        if (dirty) {
          toast.warning("This file changed on disk.", {
            description: "You have unsaved edits.",
            action: {
              label: "Reload (discard mine)",
              onClick: () => {
                void reloadActive();
              },
            },
            cancel: {
              label: "Keep mine",
              onClick: () => undefined, // dismiss; local edits are preserved
            },
          });
          return;
        }
        await reloadActive();
      })
        .then((un) => {
          // Effect already cleaned up before listen resolved: detach immediately.
          if (cancelled) un();
          else unlisten = un;
        })
        .catch(() => {
          // listen() rejects when the Tauri runtime is unavailable (e.g. a plain
          // browser for dev/QA); live reload is disabled rather than crashing.
        });
    } catch {
      // Defensive: a synchronous failure also just disables live reload.
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [reloadActive]);

  // Open files handed to us by the OS (default-app / file association on macOS,
  // `open file.md`). Drain any path buffered before the webview mounted, then
  // listen for opens that arrive while we're already running. Declared after the
  // watcher so its listen() resolves first; mirrors the same defensive guards so
  // a missing Tauri runtime (plain-browser QA) disables OS-open instead of
  // crashing.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void takePendingOpen()
      .then((paths) => {
        if (paths[0]) void openFileByPath(paths[0]);
      })
      .catch(() => {});
    try {
      listen<string[]>("open-files", (ev) => {
        if (ev.payload?.[0]) void openFileByPath(ev.payload[0]);
      })
        .then((un) => {
          if (cancelled) un();
          else unlisten = un;
        })
        .catch(() => {});
    } catch {
      // Defensive: a synchronous failure also just disables OS-open.
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [openFileByPath]);

  const folderName = s.root ? (s.root.split(/[/\\]/).filter(Boolean).pop() ?? null) : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {toasterReady && (
        <Suspense fallback={null}>
          <Toaster position="bottom-right" />
        </Suspense>
      )}
      <CommandPalette files={s.files} onPick={openFile} />
      {activePanelId === "search" && (
        <Suspense fallback={null}>
          <SearchPanel
            open
            hits={searchHits}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onPick={onSearchPick}
            onClose={() => {
              void registry.runCommand("search.close");
              setSearchQuery("");
              setSearchHits([]);
            }}
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
