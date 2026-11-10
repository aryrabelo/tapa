import { listen } from "@tauri-apps/api/event";
import type { Module } from "@/lib/registry";
import { liveRefsResolve, liveRefsRun } from "@/lib/tauri";
import { liveRefs } from "./extension";

// Live references: `[herdr-openrig w1BA:p1]` in a note gets a chip with the
// output of a command the user approved in Settings. Off by default. Rust owns
// the commands and decides what matches; this side only finds `[...]` texts,
// asks, polls and draws.
export const liveRefsModule: Module = {
  id: "live-refs",
  register() {},
  activate(ctx) {
    ctx.registerEditorExtension(
      liveRefs({
        resolve: liveRefsResolve,
        run: liveRefsRun,
        onConfigChanged(cb) {
          let off: (() => void) | null = null;
          let dropped = false;
          listen("live-refs-changed", cb).then(
            (unlisten) => {
              if (dropped) unlisten();
              else off = unlisten;
            },
            () => {},
          );
          return () => {
            dropped = true;
            off?.();
          };
        },
      }),
    );
  },
};
