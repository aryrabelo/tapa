import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Code under test starts imports it does not hand back (keybinding commands,
// React.lazy). Let them land before the next test, and before teardown.
afterEach(() => vi.dynamicImportSettled());
