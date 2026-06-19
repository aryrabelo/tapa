import { describe, it, expect } from "vitest";
import { checkSizes } from "./check-size.mjs";

describe("checkSizes", () => {
  it("passes when every artifact is within budget", () => {
    const res = checkSizes(
      [
        { name: "dmg", bytes: 100 },
        { name: "app", bytes: 200 },
      ],
      { dmg: 150, app: 250 },
    );
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([
      { name: "dmg", bytes: 100, limit: 150, over: false },
      { name: "app", bytes: 200, limit: 250, over: false },
    ]);
  });

  it("fails when the dmg is over budget and flags only that row", () => {
    const res = checkSizes(
      [
        { name: "dmg", bytes: 300 },
        { name: "app", bytes: 200 },
      ],
      { dmg: 150, app: 250 },
    );
    expect(res.ok).toBe(false);
    const dmg = res.rows.find((r) => r.name === "dmg");
    const app = res.rows.find((r) => r.name === "app");
    expect(dmg.over).toBe(true);
    expect(app.over).toBe(false);
  });

  it("marks an artifact missing from the budget as over", () => {
    const res = checkSizes([{ name: "dmg", bytes: 100 }], { app: 250 });
    expect(res.ok).toBe(false);
    expect(res.rows[0]).toEqual({ name: "dmg", bytes: 100, limit: null, over: true });
  });

  it("treats exact-equal-to-limit as within budget (boundary)", () => {
    const res = checkSizes([{ name: "dmg", bytes: 150 }], { dmg: 150 });
    expect(res.ok).toBe(true);
    expect(res.rows[0].over).toBe(false);
  });
});
