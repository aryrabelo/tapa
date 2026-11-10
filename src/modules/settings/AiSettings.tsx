import type * as React from "react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type AiProvider,
  type AiStatus,
  aiClearKey,
  aiSaveSettings,
  aiSetKey,
  aiStatus,
} from "@/lib/tauri";
import { setAiStatus } from "@/modules/autocomplete/ai";

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

// The optional AI continuation. Everything is saved by Rust: the settings in a
// small file, the key in the OS keychain. The key is write-only here: once
// saved, the panel only ever learns that one exists.
export function AiSettings(): React.ReactElement | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const keyId = useId();
  const modelId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on Retry.
  useEffect(() => {
    let live = true;
    aiStatus().then(
      (s) => {
        if (!live) return;
        setStatus(s);
        setModel(s.model);
        setAiStatus(s);
        setLoadFailed(false);
      },
      () => {
        if (live) setLoadFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!status) {
    if (!loadFailed) return null;
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">AI suggestions</h3>
        <p role="alert" className="text-xs text-destructive">
          Could not read the AI settings.
        </p>
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoadFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      </section>
    );
  }

  // True when Rust accepted the change; false after showing `failure`.
  const apply = async (request: Promise<AiStatus>, failure: string): Promise<boolean> => {
    try {
      const next = await request;
      setStatus(next);
      setAiStatus(next);
      setError(null);
      return true;
    } catch {
      setError(failure);
      return false;
    }
  };

  const save = (patch: { enabled?: boolean; provider?: AiProvider; model?: string }) =>
    apply(
      aiSaveSettings({ enabled: status.enabled, provider: status.provider, model, ...patch }),
      "Could not save the AI settings.",
    );

  const saveKey = async () => {
    const typed = key.trim();
    if (!typed) return;
    // Keep what was pasted until the keychain has it.
    if (await apply(aiSetKey(typed), "Could not save the key in the system keychain.")) {
      setKey("");
    }
  };

  const label = PROVIDERS.find((p) => p.value === status.provider)?.label ?? status.provider;
  const defaultModel = status.defaultModels[status.provider];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">AI suggestions</h3>
        <Switch
          checked={status.enabled}
          onChange={(next) => void save({ enabled: next })}
          aria-label="AI suggestions"
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Off by default. When it is on and your notes have no suggestion, Tapa sends the text around
        the caret (about 1,500 characters before it and 300 after) to {label}, with your own key,
        after you pause typing. Nothing is sent while it is off.
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Provider</span>
        <div className="flex gap-2">
          {PROVIDERS.map(({ value, label: name }) => (
            <Button
              key={value}
              size="sm"
              variant={status.provider === value ? "default" : "outline"}
              aria-pressed={status.provider === value}
              onClick={() => {
                if (value === status.provider) return;
                // A model name belongs to one provider; start from the default,
                // but only once the switch is saved.
                void save({ provider: value, model: "" }).then((ok) => {
                  if (ok) setModel("");
                });
              }}
            >
              {name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {status.keychainUnavailable ? (
          <p role="alert" className="text-xs text-destructive">
            Tapa could not reach your system keychain, so it cannot tell whether a key is saved.
          </p>
        ) : null}
        {status.hasKey ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">{label} API key</span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Key saved</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void apply(aiClearKey(), "Could not remove the key.")}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor={keyId} className="text-xs font-medium">
              {label} API key
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={keyId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                placeholder={`Paste your ${label} key`}
                onChange={(e) => setKey(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveKey();
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!key.trim()}
                onClick={() => void saveKey()}
              >
                Save key
              </Button>
            </div>
          </div>
        )}
        <span className="text-[0.7rem] text-muted-foreground">
          Kept in your system keychain. Tapa never shows it again.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={modelId} className="text-xs font-medium">
          Model (optional)
        </label>
        <Input
          id={modelId}
          value={model}
          spellCheck={false}
          placeholder={defaultModel}
          onChange={(e) => setModel(e.currentTarget.value)}
          onBlur={() => {
            if (model.trim() !== status.model) void save({ model: model.trim() });
          }}
        />
        <span className="text-[0.7rem] text-muted-foreground">
          Leave blank for {defaultModel}, a fast, low-cost model.
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
