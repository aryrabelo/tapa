import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveRefResult } from "@/lib/tauri";
import { clearResultCache, MAX_BACKOFF_MS, MAX_CACHED, MAX_KEYS, Scheduler } from "./scheduler";

const ok = (state: string): LiveRefResult => ({
  status: "ok",
  name: "k",
  state,
  detail: "",
  exitCode: 0,
  ms: 1,
});
const failed: LiveRefResult = { ...ok("x"), status: "error" };

let runs: string[];
let answer: (text: string) => Promise<LiveRefResult>;
let s: Scheduler;

beforeEach(() => {
  vi.useFakeTimers();
  clearResultCache();
  runs = [];
  answer = async (t) => ok(`state of ${t}`);
  s = new Scheduler({
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    run: (t) => {
      runs.push(t);
      return answer(t);
    },
    onChange: () => {},
  });
});

afterEach(() => {
  s.dispose();
  vi.useRealTimers();
});

describe("Scheduler", () => {
  it("runs each distinct text once per interval and keeps the answer", async () => {
    s.setKeys([
      ["a", 5],
      ["a", 5],
      ["b", 10],
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a", "b"]);
    expect(s.get("a")?.result?.state).toBe("state of a");
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toEqual(["a", "b", "a"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toEqual(["a", "b", "a", "a", "b"]);
  });

  it("never overlaps a slow run of the same text", async () => {
    answer = (t) => new Promise((r) => setTimeout(() => r(ok(t)), 3000));
    s.setKeys([["a", 2]]);
    await vi.advanceTimersByTimeAsync(2900);
    expect(runs).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(100); // answer at 3 s, next run 2 s later
    await vi.advanceTimersByTimeAsync(1900);
    expect(runs).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toEqual(["a", "a"]);
  });

  it("stops while hidden and runs stale texts once on return", async () => {
    s.setKeys([["a", 5]]);
    await vi.advanceTimersByTimeAsync(0);
    s.setVisible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toEqual(["a"]);
    s.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a", "a"]);
  });

  it("backs off after failures, capped, and resets on success", async () => {
    answer = async () => failed;
    s.setKeys([["a", 10]]);
    await vi.advanceTimersByTimeAsync(0); // fail 1 → wait 20 s
    await vi.advanceTimersByTimeAsync(19_999);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // fail 2 → wait 40 s
    expect(runs).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(40_000); // fail 3 → 80 s
    expect(runs).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(80_000 + 160_000); // fail 4, fail 5
    expect(runs).toHaveLength(5);
    // 10 s × 2⁵ = 320 s, capped at 300 s.
    answer = async () => ok("fine");
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS - 1);
    expect(runs).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(1); // 6: success
    expect(runs).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toHaveLength(7);
  });

  it("does not repeat a reference Rust called invalid", async () => {
    answer = async () => ({ ...failed, status: "invalid_arg" });
    s.setKeys([["a", 2]]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toEqual(["a"]);
  });

  it("drops texts that leave the note", async () => {
    s.setKeys([["a", 2]]);
    await vi.advanceTimersByTimeAsync(0);
    s.setKeys([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toEqual(["a"]);
    expect(s.get("a")).toBeNull();
  });

  it(`runs at most ${MAX_KEYS} texts and marks the rest`, async () => {
    s.setKeys(Array.from({ length: MAX_KEYS + 1 }, (_, i) => [`t${i}`, 5] as const));
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toHaveLength(MAX_KEYS);
    expect(runs).not.toContain(`t${MAX_KEYS}`);
    expect(s.get(`t${MAX_KEYS}`)?.overLimit).toBe(true);
  });

  it("keeps answers across schedulers, so reopening a note shows them at once", async () => {
    s.setKeys([["a", 5]]);
    await vi.advanceTimersByTimeAsync(0);
    s.dispose();
    s = new Scheduler({
      now: () => Date.now(),
      setTimer: () => 0,
      clearTimer: () => {},
      run: answer,
      onChange: () => {},
    });
    s.setKeys([["a", 5]]);
    expect(s.get("a")?.result?.state).toBe("state of a");
  });

  it("turns a rejected call into an error answer", async () => {
    answer = () => Promise.reject(new Error("ipc down"));
    s.setKeys([["a", 5]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.get("a")?.result).toMatchObject({ status: "error", detail: "Error: ipc down" });
  });

  it("keeps a backed-off wait when the window shows again", async () => {
    answer = async () => failed;
    s.setKeys([["a", 10]]);
    await vi.advanceTimersByTimeAsync(0); // fail 1 → next run at 20 s
    s.setVisible(false);
    await vi.advanceTimersByTimeAsync(15_000);
    s.setVisible(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toHaveLength(2);
  });

  it("does not re-run a parked reference when the window shows again", async () => {
    answer = async () => ({ ...failed, status: "unknown_ref" });
    s.setKeys([["a", 2]]);
    await vi.advanceTimersByTimeAsync(0);
    s.setVisible(false);
    await vi.advanceTimersByTimeAsync(10_000);
    s.setVisible(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toEqual(["a"]);
  });

  it("never polls a failing reference sooner than its interval", async () => {
    answer = async () => failed;
    s.setKeys([["a", 3600]]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3_600_000 - 1);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toHaveLength(2);
  });

  it("drops an answer from a run that started before the cache was cleared", async () => {
    let release: (r: LiveRefResult) => void = () => {};
    answer = () => new Promise((r) => (release = r));
    s.setKeys([["a", 5]]);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a"]);
    clearResultCache();
    release(ok("old command"));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.get("a")?.result).toBeNull();
  });

  it(`remembers at most ${MAX_CACHED} answers, dropping the oldest`, async () => {
    for (let i = 0; i <= MAX_CACHED; i++) {
      s.setKeys([[`t${i}`, 5]]);
      await vi.advanceTimersByTimeAsync(0);
    }
    s.setKeys([
      ["t0", 5],
      ["t1", 5],
    ]);
    expect(s.get("t0")?.result).toBeNull();
    expect(s.get("t1")?.result?.state).toBe("state of t1");
  });
});
