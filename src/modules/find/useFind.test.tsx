import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { registry } from "@/lib/registry";
import { findModule } from "@/modules/find";
import { useFind } from "@/modules/find/useFind";
import { useStore } from "@/state/store";

registry.register(findModule);

// Minimal harness exercising the controller over a real DOM reader container.
// CSS.highlights / scrollIntoView do not exist in jsdom; the hook feature-guards
// them, so only counting + indexing are observable here.
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

afterEach(() => {
  document.querySelector("[data-reader]")?.remove();
});

describe("useFind", () => {
  it("counts matches in the rendered reader text", async () => {
    useStore.getState().setActive("x.md", "the quick brown fox jumps over the lazy fox");
    // Find is reader-mode only; setActive now defaults to edit mode, so switch back.
    useStore.getState().exitEdit();
    const reader = document.createElement("article");
    reader.setAttribute("data-reader", "");
    reader.textContent = "the quick brown fox jumps over the lazy fox";
    document.body.appendChild(reader);

    await registry.runCommand("find.open");
    render(<Harness />);

    fireEvent.input(screen.getByLabelText("q"), { target: { value: "fox" } });

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getByTestId("current").textContent).toBe("0");
  });
});
