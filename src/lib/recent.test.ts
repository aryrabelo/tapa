import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri", () => ({ setRecentMenu: vi.fn(() => Promise.resolve()) }));

import { setRecentMenu } from "@/lib/tauri";
import { addRecent, clearRecents, pushRecent, RECENT_LIMIT, removeRecent } from "./recent";

beforeEach(() => {
  clearRecents();
  vi.mocked(setRecentMenu).mockClear();
});

describe("addRecent", () => {
  it("puts the newest first and moves a reopened path to the top without a copy", () => {
    expect(addRecent(["/b", "/a"], "/c")).toEqual(["/c", "/b", "/a"]);
    expect(addRecent(["/c", "/b", "/a"], "/a")).toEqual(["/a", "/c", "/b"]);
  });

  it("keeps at most the limit, dropping the oldest", () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => `/n${i}`);
    const next = addRecent(full, "/new");
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("/new");
    expect(next).not.toContain(`/n${RECENT_LIMIT - 1}`);
  });
});

describe("recent list", () => {
  it("persists, mirrors into the native menu, and forgets removed paths", async () => {
    pushRecent("/vault");
    pushRecent("/notes/a.md");
    pushRecent("/vault");
    expect(JSON.parse(localStorage.getItem("tapa-recent") ?? "[]")).toEqual([
      "/vault",
      "/notes/a.md",
    ]);
    removeRecent("/notes/a.md");
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(setRecentMenu).mock.calls.at(-1)).toEqual([["/vault"]]);
  });
});
