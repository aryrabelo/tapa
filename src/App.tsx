import type * as React from "react";
import { Suspense, lazy, useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { AppHeader } from "@/components/layout/AppHeader";
import { createPath, scanTree } from "@/lib/tauri";
import { onToasterNeeded, toast } from "@/lib/toast";
import { useStore } from "@/state/store";
import { registry, useActivePanel } from "@/lib/registry";
import { useSearch } from "@/modules/search/useSearch";
import { useFileWatcher } from "@/lib/useFileWatcher";
import { useOsOpen } from "@/lib/useOsOpen";
import { installMenuListener } from "@/lib/menu";
import { syncRecentMenu } from "@/lib/recent";
import { bootCorePlugins } from "@/lib/plugins";
import { ContextMenu } from "@/components/ContextMenu";
import {
  autosave,
  installAutosave,
  newFile,
  openFile,
  openNote,
  openPath,
  rememberSession,
  restoreSession,
  save,
} from "@/modules/files/actions";
import { guardWindowClose, syncWindowTitle, useDragDrop } from "@/modules/files/desktop";
import { Welcome } from "@/modules/files/Welcome";

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

const RenameDialog = lazy(() =>
  import("@/modules/files/RenameDialog").then((m) => ({ default: m.RenameDialog })),
);

// Sidebar "+": create a new file or directory relative to the open folder
// (no native Save dialog). An empty directory appears once it holds a note.
async function createEntry(rel: string, dir: boolean): Promise<void> {
  const { root } = useStore.getState();
  if (!root || !rel) return;
  if (!dir && !(await autosave.flush())) return;
  try {
    await createPath(`${root}/${rel}`, dir);
    useStore.getState().setFolder(root, await scanTree(root));
  } catch (e) {
    toast.error(String(e));
    return;
  }
  if (dir) {
    toast.success("Folder created — it appears once it has a note.");
  } else {
    useStore.getState().setActive(rel, "");
  }
}

export default function App(): React.ReactElement {
  const s = useStore();
  const [toasterReady, setToasterReady] = useState(false);
  const dragging = useDragDrop();

  // Desktop wiring, once: autosave, session memory, window title, save before
  // close, and the native menu (recent items open paths, other ids run commands).
  useEffect(() => {
    onToasterNeeded(() => setToasterReady(true));
    syncRecentMenu();
    const offs = [
      installAutosave(),
      rememberSession(),
      syncWindowTitle(),
      guardWindowClose(),
      installMenuListener(openPath),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);

  const activePanelId = useActivePanel();
  const search = useSearch(openNote);
  useFileWatcher();
  // An OS-delivered file wins; a plain launch reopens the last folder and note.
  useOsOpen(openFile, restoreSession);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {toasterReady && (
        <Suspense fallback={null}>
          <Toaster position="bottom-right" />
        </Suspense>
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-2 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-ring/60 bg-background/70 text-sm text-muted-foreground">
          Drop a note or a folder to open it
        </div>
      )}
      <CommandPalette files={s.files} onPick={openNote} onOpenPath={openPath} />
      <ContextMenu />
      {s.renameOpen && s.activePath && (
        <Suspense fallback={null}>
          <RenameDialog />
        </Suspense>
      )}
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
          <FindBar />
        </Suspense>
      )}
      {activePanelId === "settings" && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => registry.runCommand("settings.close")} />
        </Suspense>
      )}
      {s.sidebarOpen && (
        <Suspense fallback={null}>
          <AppSidebar
            tree={s.tree}
            active={s.activePath}
            onPick={openNote}
            onNewFile={newFile}
            onCreate={createEntry}
          />
        </Suspense>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="min-h-0 flex-1 overflow-auto">
          {!s.activePath && !s.root && <Welcome />}
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
                key={s.noteKey ?? s.activePath}
                doc={s.content}
                cursor={s.editOffset ?? 0}
                onChange={s.setContent}
                onSave={() => void save({ silent: false })}
                onBlurSave={() => save()}
              />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
