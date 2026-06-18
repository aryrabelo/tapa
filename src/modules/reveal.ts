import type { Disposer, ModuleContext } from "@/lib/registry";

export interface RevealController {
  active(): boolean;
  toggle(ctx: ModuleContext): void;
  stop(): void;
}

// Shared engine for the presentation and live-write modules: it hides the
// reader's rendered blocks (direct `[data-so]` children) behind a module-scoped
// style, then reveals them one at a time. The `driver` supplies the mode's
// advance trigger (per click, on a timer, ...) and its teardown; Esc always
// stops. Only one block-reveal session runs at a time per controller.
export function createBlockReveal(opts: {
  className: string;
  transition: string;
  hiddenStyle: string;
  driver(controls: { advance: () => boolean; stop: () => void }): Disposer;
}): RevealController {
  const { className, transition, hiddenStyle, driver } = opts;
  const hiddenAttr = `data-${className}-hidden`;
  const css =
    `.${className} > [data-so] { transition: ${transition}; }\n` +
    `.${className} > [data-so][${hiddenAttr}="1"] { ${hiddenStyle} }`;

  let session: Disposer[] | null = null;
  let reveal = 0;
  let container: HTMLElement | null = null;

  // Re-queried each time so it tracks re-renders (live reload, edits).
  const blocks = () =>
    container ? Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-so]")) : [];

  const applyReveal = () => {
    blocks().forEach((el, i) => {
      el.setAttribute(hiddenAttr, i < reveal ? "0" : "1");
    });
  };

  const tag = (c: HTMLElement) => {
    container = c;
    c.classList.add(className);
    applyReveal();
  };

  // Reveals the next hidden block; returns whether any remain hidden afterwards.
  const advance = (): boolean => {
    const total = blocks().length;
    if (reveal >= total) return false;
    reveal++;
    applyReveal();
    return reveal < total;
  };

  const stop = () => {
    if (!session) return;
    for (const dispose of session) dispose();
    session = null;
    if (container) {
      container.classList.remove(className);
      for (const el of blocks()) el.removeAttribute(hiddenAttr);
      container = null;
    }
  };

  const start = (ctx: ModuleContext) => {
    reveal = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    document.addEventListener("keydown", onKey);
    session = [
      ctx.registerStyle(css),
      ctx.onReaderRender(tag), // fires immediately with the current container
      () => document.removeEventListener("keydown", onKey),
      driver({ advance, stop }),
    ];
  };

  return {
    active: () => session !== null,
    toggle: (ctx) => {
      if (session) stop();
      else start(ctx);
    },
    stop,
  };
}
