import type { Module } from "@/lib/registry";
import { getZoom, setZoom, ZOOM_STEP } from "@/lib/zoom";

// Bigger/smaller note text (⌘= ⌘- ⌘0, from the native View menu). main.tsx
// applies the saved size before the first render; these only change it.
export const zoomModule: Module = {
  id: "zoom",
  register(reg) {
    reg.command({
      id: "view.zoomIn",
      title: "Bigger text",
      run: () => void setZoom(getZoom() + ZOOM_STEP),
    });
    reg.command({
      id: "view.zoomOut",
      title: "Smaller text",
      run: () => void setZoom(getZoom() - ZOOM_STEP),
    });
    reg.command({
      id: "view.zoomReset",
      title: "Actual size",
      run: () => void setZoom(100),
    });
  },
  activate() {},
};
