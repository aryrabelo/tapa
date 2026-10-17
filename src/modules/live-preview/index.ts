import { livePreview, markersRevealed, revealOnInteract } from "@/components/editor/live-preview";
import { livePreviewTheme } from "@/components/editor/live-preview-theme";
import type { Module } from "@/lib/registry";

// Hides Markdown markers and styles the note. The theme rides along so the
// formatted page and the symbols-visible page share one look.
export const livePreviewModule: Module = {
  id: "live-preview",
  register() {},
  activate(ctx) {
    ctx.registerEditorExtension(markersRevealed);
    ctx.registerEditorExtension(revealOnInteract);
    ctx.registerEditorExtension(livePreview);
    ctx.registerEditorExtension(livePreviewTheme);
  },
};
