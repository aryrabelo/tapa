import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry } from "@/lib/registry";
import { livewriteModule, STEP_MS } from "@/modules/livewrite";

const HIDDEN = "data-tapa-livewrite-hidden";

// Build an <article> with `n` direct-child rendered blocks, like the reader does.
function makeArticle(n: number): HTMLElement {
  const article = document.createElement("article");
  for (let i = 0; i < n; i++) {
    const block = document.createElement("p");
    block.setAttribute("data-so", String(i));
    block.textContent = `block ${i}`;
    article.appendChild(block);
  }
  document.body.appendChild(article);
  return article;
}

const blocks = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>(":scope > [data-so]"));
const hiddenCount = (c: HTMLElement) =>
  blocks(c).filter((el) => el.getAttribute(HIDDEN) === "1").length;
const revealedCount = (c: HTMLElement) =>
  blocks(c).filter((el) => el.getAttribute(HIDDEN) === "0").length;

describe("livewrite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // The `reveal` controller is a module-level singleton shared across tests;
    // Esc stops any session still active so the next test starts clean.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    vi.useRealTimers();
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => {
      s.remove();
    });
  });

  async function launch(article: HTMLElement) {
    const reg = createRegistry();
    reg.register(livewriteModule);
    reg.emitReaderRender(article); // reader rendered before the command runs
    await reg.runCommand("livewrite.toggle");
    return reg;
  }

  it("hides every block on launch, then reveals one more per STEP_MS", async () => {
    const article = makeArticle(4);
    await launch(article);

    // (a) all blocks start hidden
    expect(hiddenCount(article)).toBe(4);
    expect(revealedCount(article)).toBe(0);

    // (b) the timer reveals one more block at a time
    vi.advanceTimersByTime(STEP_MS);
    expect(revealedCount(article)).toBe(1);
    vi.advanceTimersByTime(STEP_MS);
    expect(revealedCount(article)).toBe(2);
    vi.advanceTimersByTime(STEP_MS);
    expect(revealedCount(article)).toBe(3);
  });

  it("is not stopped by the click that launched it (menu / palette)", async () => {
    const article = makeArticle(4);
    await launch(article);

    // A click arriving right after launch (e.g. the context-menu item or ⌘K
    // palette pick, plus any overlay-teardown click a frame later) must not
    // cancel the session before anything has revealed.
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hiddenCount(article)).toBe(4); // still active, still all hidden
    expect(article.classList.contains("tapa-livewrite")).toBe(true);

    // The timer still drives the reveal forward.
    vi.advanceTimersByTime(STEP_MS);
    expect(revealedCount(article)).toBe(1);
  });

  it("stops on a click after the first block has revealed", async () => {
    const article = makeArticle(4);
    await launch(article);

    vi.advanceTimersByTime(STEP_MS); // first block now visible
    expect(revealedCount(article)).toBe(1);

    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // stop() tears down: class gone and the hidden attribute removed from all.
    expect(article.classList.contains("tapa-livewrite")).toBe(false);
    expect(blocks(article).some((el) => el.hasAttribute(HIDDEN))).toBe(false);

    // The interval is cleared: further ticks reveal nothing new.
    vi.advanceTimersByTime(STEP_MS * 3);
    expect(blocks(article).some((el) => el.hasAttribute(HIDDEN))).toBe(false);
  });
});
