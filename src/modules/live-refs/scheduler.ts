import type { LiveRefResult } from "@/lib/tauri";

/** At most this many distinct references per note are polled. */
export const MAX_KEYS = 20;
/** Failures double the wait up to this. */
export const MAX_BACKOFF_MS = 5 * 60_000;

export interface Entry {
  /** Last answer, or null before the first one arrives. */
  result: LiveRefResult | null;
  /** When `result` arrived (clock ms). */
  updatedAt: number;
  /** Over the per-note cap: shown, never run. */
  overLimit: boolean;
}

export interface SchedulerDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  run(text: string): Promise<LiveRefResult>;
  /** Called after any entry changes. */
  onChange(): void;
}

interface Slot {
  intervalMs: number;
  nextAt: number;
  inflight: boolean;
  failures: number;
  lastRunAt: number;
}

// Last answers outlive the editor, so switching notes and back shows them at once.
const cache = new Map<string, { result: LiveRefResult; at: number }>();

/** Clears remembered answers (config changed, or tests). */
export function clearResultCache(): void {
  cache.clear();
}

/**
 * Polls each resolved reference text on its own interval with a single timer.
 * Identical texts share one slot, a slot never runs twice at once, and nothing
 * runs while the window is hidden.
 */
export class Scheduler {
  private slots = new Map<string, Slot>();
  private overLimit = new Set<string>();
  private timer: unknown = null;
  private visible = true;
  private disposed = false;

  constructor(private deps: SchedulerDeps) {}

  /** Texts in document order with their interval. Replaces the previous set. */
  setKeys(keys: ReadonlyArray<readonly [text: string, intervalSec: number]>): void {
    const next = new Map<string, Slot>();
    this.overLimit = new Set();
    const now = this.deps.now();
    for (const [text, intervalSec] of keys) {
      if (next.has(text) || this.overLimit.has(text)) continue;
      if (next.size >= MAX_KEYS) {
        this.overLimit.add(text);
        continue;
      }
      const old = this.slots.get(text);
      const intervalMs = intervalSec * 1000;
      if (old) {
        old.intervalMs = intervalMs;
        next.set(text, old);
      } else {
        next.set(text, {
          intervalMs,
          nextAt: now,
          inflight: false,
          failures: 0,
          lastRunAt: -Infinity,
        });
      }
    }
    this.slots = next;
    this.schedule();
    this.deps.onChange();
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) {
      this.stopTimer();
      return;
    }
    // Back in view: one immediate run for whatever went stale, no catch-up.
    const now = this.deps.now();
    for (const slot of this.slots.values()) {
      if (now - slot.lastRunAt >= slot.intervalMs) slot.nextAt = Math.min(slot.nextAt, now);
    }
    this.schedule();
  }

  get(text: string): Entry | null {
    if (this.overLimit.has(text)) {
      return { result: null, updatedAt: 0, overLimit: true };
    }
    if (!this.slots.has(text)) return null;
    const hit = cache.get(text);
    return { result: hit?.result ?? null, updatedAt: hit?.at ?? 0, overLimit: false };
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer();
    this.slots.clear();
  }

  private stopTimer(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.stopTimer();
    if (!this.visible || this.disposed) return;
    let soonest = Infinity;
    for (const slot of this.slots.values()) {
      if (!slot.inflight) soonest = Math.min(soonest, slot.nextAt);
    }
    if (soonest === Infinity) return;
    const wait = Math.max(0, soonest - this.deps.now());
    this.timer = this.deps.setTimer(() => this.tick(), wait);
  }

  private tick(): void {
    this.timer = null;
    const now = this.deps.now();
    for (const [text, slot] of this.slots) {
      if (slot.inflight || slot.nextAt > now) continue;
      this.start(text, slot, now);
    }
    this.schedule();
  }

  private start(text: string, slot: Slot, now: number): void {
    slot.inflight = true;
    slot.lastRunAt = now;
    const settle = (result: LiveRefResult) => {
      slot.inflight = false;
      if (this.disposed) return;
      const at = this.deps.now();
      slot.nextAt = at + nextDelay(slot, result.status);
      if (result.status !== "busy" || !cache.has(text)) cache.set(text, { result, at });
      // A slot dropped by setKeys while running stays out.
      if (this.slots.get(text) === slot) {
        this.schedule();
        this.deps.onChange();
      }
    };
    this.deps.run(text).then(settle, (err: unknown) =>
      settle({
        status: "error",
        name: null,
        state: "error",
        detail: String(err),
        exitCode: null,
        ms: 0,
      }),
    );
  }
}

function nextDelay(slot: Slot, status: LiveRefResult["status"]): number {
  switch (status) {
    case "ok":
      slot.failures = 0;
      return slot.intervalMs;
    case "error":
    case "timeout":
      slot.failures++;
      return Math.min(slot.intervalMs * 2 ** slot.failures, MAX_BACKOFF_MS);
    case "busy":
      return slot.intervalMs;
    default:
      // unknown_ref / invalid_arg: running again would give the same answer.
      return Infinity;
  }
}
