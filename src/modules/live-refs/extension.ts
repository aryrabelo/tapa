import { type Extension, RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  type DecorationSet,
  Decoration,
  type EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { LiveRefResolved, LiveRefResult } from "@/lib/tauri";
import { type Candidate, findCandidates, uniqueTexts } from "./candidates";
import { clearResultCache, Scheduler } from "./scheduler";
import { ChipWidget, chipTheme, chipView, detailDOM } from "./widget";

export interface LiveRefsDeps {
  resolve(texts: string[]): Promise<LiveRefResolved[]>;
  run(text: string): Promise<LiveRefResult>;
  /** Calls back when the saved commands change. Returns an unsubscribe. */
  onConfigChanged(cb: () => void): () => void;
  now?: () => number;
  /** Delay between an edit and the rescan. */
  debounceMs?: number;
}

const DEBOUNCE_MS = 300;
const refresh = StateEffect.define<null>();

class LiveRefsPlugin {
  decorations: DecorationSet = Decoration.none;
  private scheduler: Scheduler;
  private resolved = new Map<string, NonNullable<LiveRefResolved>>();
  private textsKey = "";
  private generation = 0;
  private debounce: number | undefined;
  private destroyed = false;
  private unsubscribe: () => void;
  private onVisibility = () => this.scheduler.setVisible(document.visibilityState !== "hidden");
  private now: () => number;

  constructor(
    private view: EditorView,
    private deps: LiveRefsDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.scheduler = new Scheduler({
      now: this.now,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      run: deps.run,
      onChange: () => this.requestRedraw(),
    });
    this.scheduler.setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", this.onVisibility);
    this.unsubscribe = deps.onConfigChanged(() => {
      clearResultCache();
      // A resolve in flight from before the change must not be applied.
      this.generation++;
      this.textsKey = "";
      this.resolved.clear();
      this.scheduler.setKeys([]);
      this.rescan();
    });
    this.rescan();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged) this.scheduleRescan();
    if (
      u.docChanged ||
      u.viewportChanged ||
      u.transactions.some((t) => t.effects.some((e) => e.is(refresh)))
    ) {
      this.decorations = this.build();
    }
  }

  destroy(): void {
    this.generation++;
    this.destroyed = true;
    window.clearTimeout(this.debounce);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.unsubscribe();
    this.scheduler.dispose();
  }

  /** The candidate and entry under `pos`, for the hover card. */
  at(pos: number): { candidate: Candidate; text: string } | null {
    const line = this.view.state.doc.lineAt(pos);
    for (const c of findCandidates(this.view.state, line.from, line.to)) {
      if (pos >= c.from && pos <= c.to && this.resolved.has(c.text))
        return { candidate: c, text: c.text };
    }
    return null;
  }

  entryView(text: string) {
    const entry = this.scheduler.get(text);
    return entry
      ? { view: chipView(entry), updatedAt: entry.updatedAt, hasResult: entry.result !== null }
      : null;
  }

  private requestRedraw(): void {
    // Answers arrive from timers; the view may be gone by then.
    queueMicrotask(() => {
      if (!this.destroyed) this.view.dispatch({ effects: refresh.of(null) });
    });
  }

  private scheduleRescan(): void {
    window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => this.rescan(), this.deps.debounceMs ?? DEBOUNCE_MS);
  }

  private rescan(): void {
    window.clearTimeout(this.debounce);
    this.debounce = undefined;
    const texts = uniqueTexts(findCandidates(this.view.state));
    const key = texts.join("\u0000");
    if (key === this.textsKey) return;
    this.textsKey = key;
    const gen = ++this.generation;
    if (texts.length === 0) {
      this.apply(texts, []);
      return;
    }
    this.deps.resolve(texts).then(
      (answers) => {
        if (gen === this.generation) this.apply(texts, answers);
      },
      () => {
        if (gen === this.generation) this.apply(texts, []);
      },
    );
  }

  private apply(texts: string[], answers: LiveRefResolved[]): void {
    this.resolved.clear();
    const keys: [string, number][] = [];
    texts.forEach((text, i) => {
      const hit = answers[i];
      if (!hit) return;
      this.resolved.set(text, hit);
      keys.push([text, hit.intervalSec]);
    });
    this.scheduler.setKeys(keys);
    this.requestRedraw();
  }

  private build(): DecorationSet {
    if (this.resolved.size === 0) return Decoration.none;
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of this.view.visibleRanges) {
      for (const c of findCandidates(this.view.state, from, to)) {
        if (!this.resolved.has(c.text)) continue;
        const entry = this.scheduler.get(c.text);
        if (!entry) continue;
        builder.add(
          c.to,
          c.to,
          Decoration.widget({ widget: new ChipWidget(c.text, chipView(entry)), side: 1 }),
        );
      }
    }
    return builder.finish();
  }
}

/** Draws a status chip after each live reference and keeps it current. */
export function liveRefs(deps: LiveRefsDeps): Extension {
  const plugin = ViewPlugin.define((view) => new LiveRefsPlugin(view, deps), {
    decorations: (p) => p.decorations,
  });
  const now = deps.now ?? Date.now;
  const hover = hoverTooltip((view, pos) => {
    const p = view.plugin(plugin);
    const hit = p?.at(pos);
    if (!p || !hit) return null;
    const ev = p.entryView(hit.text);
    if (!ev) return null;
    const ago = ev.hasResult ? Math.max(0, Math.round((now() - ev.updatedAt) / 1000)) : null;
    return {
      pos: hit.candidate.from,
      end: hit.candidate.to,
      above: true,
      create: () => ({ dom: detailDOM(hit.text, ev.view, ago) }),
    };
  });
  return [plugin, hover, chipTheme];
}
