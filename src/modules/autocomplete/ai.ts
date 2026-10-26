// The optional AI continuation, seen from the editor. Off by default: nothing
// is asked until Settings turns it on and a key is saved. The request itself
// is made by Rust (`ai_complete`), which holds the key; this file only decides
// whether to ask and keeps failures quiet.
import { type AiError, type AiStatus, aiComplete, aiStatus } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import type { RemoteSuggest } from "./ghost";

let active = false;
let revision = 0;
let warned = false;

/** Called with every status Settings receives, so a change applies at once. */
export function setAiStatus(status: AiStatus): void {
  revision++;
  active = status.enabled && status.hasKey;
}

/** Reads the saved choice once the editor loads. A failure leaves AI off. */
export async function loadAiStatus(): Promise<void> {
  const asked = revision;
  try {
    const status = await aiStatus();
    // Settings may have saved a newer choice while this was in flight.
    if (asked === revision) setAiStatus(status);
  } catch {
    if (asked === revision) active = false;
  }
}

const MESSAGES: Partial<Record<AiError["kind"], string>> = {
  badKey: "Your AI key was not accepted. Check it in Settings.",
  rateLimited: "The AI provider is limiting requests for now.",
  timeout: "AI suggestions could not reach the provider.",
  network: "AI suggestions could not reach the provider.",
  provider: "The AI provider returned an error.",
  badResponse: "The AI provider sent an answer Tapa could not read.",
  keychain: "Tapa could not read your AI key from the keychain.",
};

function errorKind(err: unknown): AiError["kind"] {
  if (typeof err === "object" && err !== null && "kind" in err) {
    return (err as AiError).kind;
  }
  return "network";
}

// One toast per session at most, never per keystroke. `off`/`noKey` are
// settings, not failures, and stay silent.
function report(err: unknown): void {
  const kind = errorKind(err);
  // A refused key fails every time: stop asking until Settings changes.
  if (kind === "badKey" || kind === "noKey" || kind === "off") active = false;
  const message = MESSAGES[kind];
  if (!message || warned) return;
  warned = true;
  toast.warning(message, { description: "Suggestions from your notes keep working." });
}

/** The `remote` for `ghostText`: asks Rust only while AI is on with a key. */
export const aiSuggest: RemoteSuggest = async (before, after, signal) => {
  if (!active || signal.aborted) return null;
  try {
    const text = await aiComplete(before, after);
    return signal.aborted ? null : text;
  } catch (err) {
    report(err);
    return null;
  }
};
