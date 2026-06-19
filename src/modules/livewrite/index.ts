import type { Module } from "@/lib/registry";
import { createBlockReveal } from "@/modules/reveal";

// ponytail: block-granular reveal — looks like a typewriter for screen
// recording without walking text nodes; switch to per-character if needed later.
export const STEP_MS = 700;

// Live-write mode: progressively reveals the active file's rendered content over
// time (animated reveal) for screen recordings. Stops on click, Esc, or
// re-running the command.
const reveal = createBlockReveal({
  className: "tapa-livewrite",
  transition: "opacity 320ms ease",
  hiddenStyle: "opacity: 0;",
  driver: ({ advance, stop }) => {
    // Ignore clicks until the first timer-driven reveal. Otherwise the very
    // interaction that launches live-write (a context-menu item or ⌘K palette
    // pick is a click) reaches this stop listener and cancels the session
    // before anything appears — the "nothing happens" bug. A single rAF defer
    // is not enough: overlay teardown can dispatch a click a frame later. Once
    // the first block has revealed, a click stops it (the intended UX).
    let revealed = false;
    const timer = setInterval(() => {
      revealed = true;
      if (!advance()) clearInterval(timer);
    }, STEP_MS);
    const onClick = () => {
      if (revealed) stop();
    };
    document.addEventListener("click", onClick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", onClick);
    };
  },
});

export const livewriteModule: Module = {
  id: "livewrite",
  register(reg) {
    reg.command({
      id: "livewrite.toggle",
      title: "Live-write: animate the document reveal",
      keybinding: "mod+shift+l",
      run: (ctx) => reveal.toggle(ctx),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "livewrite.toggle",
      label: "Start live-write",
      group: "Tools",
      when: (rc) => rc.path !== null,
      run: () => reveal.toggle(ctx),
    });
  },
};
