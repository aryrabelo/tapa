import { clearRecents } from "@/lib/recent";
import { registry, type Module } from "@/lib/registry";
import { useStore } from "@/state/store";
import {
  closeNote,
  newFile,
  openFileDialog,
  openFolderDialog,
  revealNote,
  save,
  saveAs,
  trashNote,
} from "./actions";

// File, View and Help commands behind the native menu. No JS keybindings: the
// menu accelerators are the single source for these shortcuts.
export const filesModule: Module = {
  id: "files",
  register(reg) {
    reg.command({ id: "file.new", title: "New File", run: newFile });
    reg.command({ id: "file.open", title: "Open File…", run: openFileDialog });
    reg.command({ id: "file.openFolder", title: "Open Folder…", run: openFolderDialog });
    reg.command({
      id: "file.save",
      title: "Save",
      run: async () => {
        await save({ silent: false });
      },
    });
    reg.command({ id: "file.saveAs", title: "Save As…", run: saveAs });
    reg.command({
      id: "file.rename",
      title: "Rename…",
      run: () => {
        if (useStore.getState().activePath) useStore.getState().setRenameOpen(true);
      },
    });
    reg.command({ id: "file.reveal", title: "Show in Finder", run: revealNote });
    reg.command({ id: "file.trash", title: "Move to Trash", run: trashNote });
    reg.command({ id: "file.close", title: "Close Note", run: closeNote });
    reg.command({ id: "file.clearRecent", title: "Clear Recent", run: clearRecents });
    reg.command({
      id: "view.toggleSidebar",
      title: "Show/Hide Sidebar",
      run: () => useStore.getState().setSidebarOpen(!useStore.getState().sidebarOpen),
    });
    reg.command({
      id: "palette.open",
      title: "Go to File…",
      run: () => useStore.getState().setPaletteOpen(!useStore.getState().paletteOpen),
    });
    reg.command({
      id: "help.shortcuts",
      title: "Keyboard Shortcuts",
      run: () => registry.runCommand("settings.open"),
    });
  },
  activate() {},
};
