import { describe, expect, it, vi } from "vitest";
import { routeMenu } from "./menu";

describe("routeMenu", () => {
  it("opens recent:<path> items as paths, keeping colons inside the path", async () => {
    const openRecent = vi.fn(() => Promise.resolve());
    const run = vi.fn(() => Promise.resolve());
    await routeMenu("recent:C:\\notes\\a.md", openRecent, run);
    expect(openRecent).toHaveBeenCalledWith("C:\\notes\\a.md");
    expect(run).not.toHaveBeenCalled();
  });

  it("runs every other id as a registry command", async () => {
    const openRecent = vi.fn(() => Promise.resolve());
    const run = vi.fn(() => Promise.resolve());
    await routeMenu("file.save", openRecent, run);
    // An id merely containing "recent" is still a command.
    await routeMenu("file.clearRecent", openRecent, run);
    expect(run.mock.calls).toEqual([["file.save"], ["file.clearRecent"]]);
    expect(openRecent).not.toHaveBeenCalled();
  });
});
