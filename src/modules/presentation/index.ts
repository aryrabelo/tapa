import type { Module } from "@/lib/registry";
import { createBlockReveal } from "@/modules/reveal";

// Click-to-reveal presentation mode: hides every reader block, then reveals one
// more per click — for recording explainer videos. Esc or re-running the command
// exits and restores. Built entirely on the first-party registry hooks
// (registerStyle + onReaderRender), no untrusted code.
const reveal = createBlockReveal({
  className: "tapa-present",
  transition: "opacity 200ms ease, filter 200ms ease",
  hiddenStyle: "opacity: 0; filter: blur(2px); pointer-events: none;",
  // requestAnimationFrame defers the click listener one frame so the very click
  // that started the presentation (the menu item / palette pick) is not counted.
  driver: ({ advance }) => {
    const onClick = () => {
      advance();
    };
    const raf = requestAnimationFrame(() => document.addEventListener("click", onClick));
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onClick);
    };
  },
});

export const presentationModule: Module = {
  id: "presentation",
  register(reg) {
    reg.command({
      id: "presentation.toggle",
      title: "Presentation: reveal blocks on click",
      keybinding: "mod+shift+p",
      run: (ctx) => reveal.toggle(ctx),
    });
  },
  activate(ctx) {
    ctx.registerContextMenuItem({
      id: "presentation.toggle",
      label: "Start presentation",
      group: "Tools",
      when: (rc) => rc.path !== null,
      run: () => reveal.toggle(ctx),
    });
  },
};
