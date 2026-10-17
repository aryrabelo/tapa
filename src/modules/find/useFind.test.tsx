import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { registry } from "@/lib/registry";
import { findModule } from "@/modules/find";
import { useFind } from "@/modules/find/useFind";
import { useStore } from "@/state/store";

registry.register(findModule);

function Harness() {
  const find = useFind();
  return (
    <div>
      <input
        aria-label="q"
        value={find.query}
        onChange={(e) => find.setQuery((e.target as HTMLInputElement).value)}
      />
      <span data-testid="count">{find.count}</span>
      <span data-testid="current">{find.current}</span>
    </div>
  );
}

describe("useFind", () => {
  it("counts matches in the open note", async () => {
    useStore.getState().setActive("x.md", "the quick brown fox jumps over the lazy fox");

    await registry.runCommand("find.open");
    render(<Harness />);

    fireEvent.input(screen.getByLabelText("q"), { target: { value: "fox" } });

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("current").textContent).toBe("0");
  });
});
