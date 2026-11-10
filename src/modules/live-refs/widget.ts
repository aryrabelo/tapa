import { EditorView, WidgetType } from "@codemirror/view";
import type { Entry } from "./scheduler";

/** Class on every chip. Also the marker the bundle check greps for. */
export const CHIP_CLASS = "cm-tapa-live-ref";

/** Remove terminal escapes and control characters. Rust already does; this is a second line. */
export function stripControls(text: string): string {
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escapes is the point.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b./g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching controls is the point.
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
  );
}

export type ChipKind = "loading" | "ok" | "error" | "timeout" | "invalid" | "limit";

export interface ChipView {
  kind: ChipKind;
  /** Short text inside the chip. */
  label: string;
  /** Known agent states get their own colour; anything else stays neutral. */
  tone: string;
  detail: string;
}

const KNOWN_TONES: Record<string, true> = {
  working: true,
  idle: true,
  blocked: true,
  done: true,
  unknown: true,
};

export function chipView(entry: Entry): ChipView {
  if (entry.overLimit) {
    return {
      kind: "limit",
      label: "not checked",
      tone: "",
      detail: "This note has more live references than Tapa checks at once (20).",
    };
  }
  const r = entry.result;
  if (!r) return { kind: "loading", label: "…", tone: "", detail: "" };
  if (r.status === "unknown_ref")
    return {
      kind: "error",
      label: "not set up",
      tone: "",
      detail: "No saved command in Settings handles this reference.",
    };
  const state = stripControls(r.state).trim();
  const detail = stripControls(r.detail);
  switch (r.status) {
    case "ok":
      return {
        kind: "ok",
        label: state || "ok",
        tone: KNOWN_TONES[state.toLowerCase()] ? state.toLowerCase() : "",
        detail,
      };
    case "timeout":
      return { kind: "timeout", label: "timed out", tone: "", detail };
    case "invalid_arg":
      return { kind: "invalid", label: "can't check this", tone: "", detail };
    case "busy":
      return { kind: "loading", label: "…", tone: "", detail };
    default:
      return { kind: "error", label: state || "error", tone: "", detail };
  }
}

/** The chip drawn after a live reference. Text only: output never becomes HTML. */
export class ChipWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly view: ChipView,
  ) {
    super();
  }

  eq(other: ChipWidget): boolean {
    const a = this.view;
    const b = other.view;
    return (
      other.text === this.text &&
      a.kind === b.kind &&
      a.label === b.label &&
      a.tone === b.tone &&
      a.detail === b.detail
    );
  }

  toDOM(): HTMLElement {
    const chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    chip.dataset.kind = this.view.kind;
    if (this.view.tone) chip.dataset.tone = this.view.tone;
    chip.setAttribute("role", "status");
    chip.setAttribute("aria-live", "off");
    chip.setAttribute("aria-label", `${this.text}: ${this.view.label}`);
    const dot = document.createElement("span");
    dot.className = `${CHIP_CLASS}-dot`;
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = this.view.label;
    chip.append(dot, label);
    return chip;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Hover card body: the full capped output as plain text. */
export function detailDOM(text: string, view: ChipView, updatedAgoSec: number | null): HTMLElement {
  const box = document.createElement("div");
  box.className = `${CHIP_CLASS}-detail`;
  const head = document.createElement("div");
  head.className = `${CHIP_CLASS}-detail-head`;
  head.textContent =
    updatedAgoSec === null
      ? `${text}: ${view.label}`
      : `${text}: ${view.label} · updated ${updatedAgoSec} s ago`;
  box.append(head);
  if (view.detail) {
    const pre = document.createElement("pre");
    pre.textContent = view.detail;
    box.append(pre);
  }
  return box;
}

export const chipTheme = EditorView.baseTheme({
  [`.${CHIP_CLASS}`]: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    marginLeft: "0.35em",
    padding: "0 0.45em",
    borderRadius: "999px",
    border: "1px solid color-mix(in srgb, currentColor 20%, transparent)",
    fontSize: "0.8em",
    lineHeight: "1.5",
    verticalAlign: "baseline",
    color: "var(--muted-foreground, #666)",
    whiteSpace: "nowrap",
    maxWidth: "24em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    userSelect: "none",
  },
  [`.${CHIP_CLASS}-dot`]: {
    width: "0.55em",
    height: "0.55em",
    borderRadius: "50%",
    background: "currentColor",
    flex: "none",
  },
  [`.${CHIP_CLASS}[data-tone=working]`]: { color: "#2563eb" },
  [`.${CHIP_CLASS}[data-tone=done]`]: { color: "#15803d" },
  [`.${CHIP_CLASS}[data-tone=blocked]`]: { color: "#b45309" },
  [`.${CHIP_CLASS}[data-kind=error]`]: { color: "#b91c1c" },
  [`.${CHIP_CLASS}[data-kind=timeout]`]: { color: "#b45309" },
  [`.${CHIP_CLASS}[data-kind=loading] .${CHIP_CLASS}-dot`]: { opacity: "0.4" },
  [`.${CHIP_CLASS}-detail`]: {
    maxWidth: "36em",
    padding: "0.4em 0.6em",
    fontSize: "0.8em",
  },
  [`.${CHIP_CLASS}-detail pre`]: {
    margin: "0.3em 0 0",
    maxHeight: "16em",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    fontFamily: "var(--font-mono, monospace)",
  },
});
