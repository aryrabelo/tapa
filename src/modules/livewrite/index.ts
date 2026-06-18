import type { Module } from "@/lib/registry";
import { createBlockReveal } from "@/modules/reveal";

// ponytail: block-granular reveal — looks like a typewriter for screen
// recording without walking text nodes; switch to per-character if needed later.
const STEP_MS = 700;

// Live-write mode: progressively reveals the active file's rendered content over
// time (animated reveal) for screen recordings. Stops on click, Esc, or
// re-running the command.
const reveal = createBlockReveal({
  className: "tapa-livewrite",
  transition: "opacity 320ms ease",
  hiddenStyle: "opacity: 0;",
  driver: ({ advance, stop }) => {
    const timer = setInterval(() => {
      if (!advance()) clearInterval(timer);
    }, STEP_MS);
    const onClick = () => {
      stop();
    };
    const raf = requestAnimationFrame(() => document.addEventListener("click", onClick));
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
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
