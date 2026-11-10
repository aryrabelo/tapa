import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type LiveRefKind,
  type LiveRefResult,
  liveRefsConfig,
  liveRefsFindProgram,
  liveRefsRun,
  liveRefsSave,
} from "@/lib/tauri";

/** Matches `[w1BA:p1]`, `[herdr-openrig w1BA:p1]` and `[bora pane get w1BA:p1]`; only the id is passed on. */
export const BORA_MATCH = "(?:.{0,64} )?(w[0-9A-Za-z]{1,8}:p[0-9]{1,4})";

export interface Draft {
  name: string;
  match: string;
  program: string;
  /** One argument per line. */
  args: string;
  intervalSec: string;
  timeoutMs: string;
  json: boolean;
  status: string;
  detail: string;
  error: string;
  enabled: boolean;
}

interface Row {
  id: number;
  draft: Draft;
  /** The kind as Rust last saved it, or null for a row not saved yet. */
  saved: LiveRefKind | null;
}

export function toDraft(k: LiveRefKind): Draft {
  const json = typeof k.parse === "object" ? k.parse.json : null;
  return {
    name: k.name,
    match: k.match,
    program: k.program,
    args: k.args.join("\n"),
    intervalSec: String(k.intervalSec),
    timeoutMs: String(k.timeoutMs),
    json: json !== null,
    status: json?.status ?? "",
    detail: json?.detail ?? "",
    error: json?.error ?? "",
    enabled: k.enabled,
  };
}

export function toKind(d: Draft): LiveRefKind {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    name: d.name.trim(),
    match: d.match,
    program: d.program.trim(),
    args: d.args.split("\n").filter((a) => a !== ""),
    intervalSec: Number(d.intervalSec),
    timeoutMs: Number(d.timeoutMs),
    parse: d.json
      ? { json: { status: d.status.trim(), detail: opt(d.detail), error: opt(d.error) } }
      : "text",
    enabled: d.enabled,
  };
}

const sameKind = (a: LiveRefKind, b: LiveRefKind) => JSON.stringify(a) === JSON.stringify(b);

/** How Settings shows the exact command: each argument separate, quoted when it has spaces. */
export function argvPreview(k: LiveRefKind): string {
  return [k.program, ...k.args]
    .map((a) => (a === "" || /[\s"'\\]/.test(a) ? JSON.stringify(a) : a))
    .join(" ");
}

function uniqueName(base: string, rows: readonly Row[]): string {
  const taken = new Set(rows.map((r) => r.draft.name.trim()));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const BLANK: Draft = {
  name: "",
  match: "",
  program: "",
  args: "",
  intervalSec: "10",
  timeoutMs: "3000",
  json: false,
  status: "",
  detail: "",
  error: "",
  enabled: true,
};

let nextId = 1;

/** Same ranges Rust accepts; checked here so a typo gets a plain message, not a parse error. */
function timingError(d: Draft): string | null {
  const whole = (s: string, min: number, max: number) =>
    /^\d+$/.test(s.trim()) && Number(s) >= min && Number(s) <= max;
  if (!whole(d.intervalSec, 2, 3600)) return "Every: use a whole number of seconds, 2 to 3600.";
  if (!whole(d.timeoutMs, 200, 10_000))
    return "Give up after: use a whole number of ms, 200 to 10000.";
  return null;
}

/** Settings section for live references. Loaded only while the plugin is on. */
export default function LiveRefsSettings(): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean; row?: number } | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setRows(null);
    liveRefsConfig().then(
      (c) => setRows(c.kinds.map((k) => ({ id: nextId++, draft: toDraft(k), saved: k }))),
      (e: unknown) => {
        setLoadError(String(e));
        setRows([]);
      },
    );
  }, []);

  useEffect(() => load(), [load]);

  if (!rows) return <p className="text-xs text-muted-foreground">Loading…</p>;

  // Saving over a config that could not be read would drop the user's commands.
  const locked = saving || loadError !== null;

  const edit = (id: number, patch: Partial<Draft>) =>
    setRows(
      (rs) => rs?.map((r) => (r.id === id ? { ...r, draft: { ...r.draft, ...patch } } : r)) ?? rs,
    );

  const addBora = async () => {
    const program = (await liveRefsFindProgram("bora").catch(() => null)) ?? "";
    setRows((rs) => {
      const list = rs ?? [];
      return [
        ...list,
        {
          id: nextId++,
          saved: null,
          draft: {
            ...BLANK,
            name: uniqueName("bora-pane", list),
            match: BORA_MATCH,
            program,
            args: "pane\nget\n{1}",
            intervalSec: "5",
            timeoutMs: "2000",
            json: true,
            status: "/result/pane/agent_status",
            detail: "/result/pane/terminal_title_stripped",
            error: "/error/message",
          },
        },
      ];
    });
    if (!program) setNotice({ text: "Could not find bora. Fill in its full path.", error: false });
  };

  const save = async () => {
    if (locked) return;
    for (const r of rows) {
      const text = timingError(r.draft);
      if (text) {
        setNotice({ text, error: true, row: r.id });
        return;
      }
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = await liveRefsSave({ version: 1, kinds: rows.map((r) => toKind(r.draft)) });
      setRows(
        saved.kinds.map((k, i) => ({ id: rows[i]?.id ?? nextId++, draft: toDraft(k), saved: k })),
      );
      setNotice({ text: "Saved.", error: false });
    } catch (e) {
      const msg = String(e);
      if (msg === "not approved") {
        setNotice({
          text: "Not saved: you chose Cancel. Your edits are still here.",
          error: false,
        });
      } else {
        const row = rows.find(
          (r) => r.draft.name.trim() && msg.startsWith(`${r.draft.name.trim()}:`),
        );
        setNotice({ text: msg, error: true, row: row?.id });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
        A note can only name these commands, never change them. Each one runs while a note showing a
        matching reference is open, and Tapa asks you before saving a new or changed command.
      </p>
      {loadError ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-destructive">
            Could not read your saved commands, so nothing can be changed: {loadError}
          </p>
          <Button size="sm" variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      ) : null}
      {rows.map((row) => (
        <KindRow
          key={row.id}
          row={row}
          locked={locked}
          onEdit={(patch) => edit(row.id, patch)}
          onRemove={() => setRows((rs) => rs?.filter((r) => r.id !== row.id) ?? rs)}
          error={notice?.error && notice.row === row.id ? notice.text : null}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() =>
            setRows((rs) => [...(rs ?? []), { id: nextId++, saved: null, draft: { ...BLANK } }])
          }
        >
          Add command
        </Button>
        <Button size="sm" variant="outline" disabled={locked} onClick={() => void addBora()}>
          Add bora pane
        </Button>
        <Button size="sm" disabled={locked} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {notice && notice.row === undefined ? (
        <p
          role="status"
          className={notice.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function KindRow({
  row,
  locked,
  onEdit,
  onRemove,
  error,
}: {
  row: Row;
  /** Saving, or the saved config could not be read: nothing can be edited. */
  locked: boolean;
  onEdit: (patch: Partial<Draft>) => void;
  onRemove: () => void;
  error: string | null;
}): React.ReactElement {
  const d = row.draft;
  const p = `live-ref-${row.id}`;
  const kind = toKind(d);
  const dirty = !row.saved || !sameKind(row.saved, kind);
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<LiveRefResult | null>(null);
  const [testing, setTesting] = useState(false);

  const find = async () => {
    const name = d.program.trim().split(/[/\\]/).pop() ?? "";
    const found = await liveRefsFindProgram(name).catch(() => null);
    if (found) onEdit({ program: found });
  };

  const test = async () => {
    setTesting(true);
    try {
      setResult(await liveRefsRun(sample));
    } catch (e) {
      setResult({
        status: "error",
        name: null,
        state: String(e),
        detail: "",
        exitCode: null,
        ms: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border p-2">
      <legend className="px-1 text-xs font-medium">{d.name || "New command"}</legend>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground">On</span>
        <Switch
          checked={d.enabled}
          disabled={locked}
          onChange={(next) => onEdit({ enabled: next })}
          aria-label={`Turn ${d.name || "this command"} on or off`}
        />
      </div>
      <Field id={`${p}-name`} label="Name">
        <Input
          id={`${p}-name`}
          value={d.name}
          disabled={locked}
          onChange={(e) => onEdit({ name: e.currentTarget.value })}
        />
      </Field>
      <Field
        id={`${p}-match`}
        label="Reference pattern (the text inside [ ], as a regular expression)"
      >
        <Input
          id={`${p}-match`}
          className="font-mono"
          value={d.match}
          disabled={locked}
          onChange={(e) => onEdit({ match: e.currentTarget.value })}
        />
      </Field>
      <Field id={`${p}-program`} label="Command (full path)">
        <div className="flex items-center gap-2">
          <Input
            id={`${p}-program`}
            className="font-mono"
            value={d.program}
            placeholder="/opt/homebrew/bin/…"
            disabled={locked}
            onChange={(e) => onEdit({ program: e.currentTarget.value })}
          />
          <Button size="sm" variant="outline" disabled={locked} onClick={() => void find()}>
            Find
          </Button>
        </div>
      </Field>
      <Field id={`${p}-args`} label="Arguments, one per line ({1} to {4} = parts of the reference)">
        <textarea
          id={`${p}-args`}
          className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-xs"
          value={d.args}
          disabled={locked}
          onChange={(e) => onEdit({ args: e.currentTarget.value })}
        />
      </Field>
      <div className="flex gap-2">
        <Field id={`${p}-interval`} label="Every (seconds)">
          <Input
            id={`${p}-interval`}
            inputMode="numeric"
            value={d.intervalSec}
            disabled={locked}
            onChange={(e) => onEdit({ intervalSec: e.currentTarget.value })}
          />
        </Field>
        <Field id={`${p}-timeout`} label="Give up after (ms)">
          <Input
            id={`${p}-timeout`}
            inputMode="numeric"
            value={d.timeoutMs}
            disabled={locked}
            onChange={(e) => onEdit({ timeoutMs: e.currentTarget.value })}
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground">Output is JSON</span>
        <Switch
          checked={d.json}
          disabled={locked}
          onChange={(next) => onEdit({ json: next })}
          aria-label="Output is JSON"
        />
      </div>
      {d.json ? (
        <>
          <Field id={`${p}-status`} label="Status pointer">
            <Input
              id={`${p}-status`}
              className="font-mono"
              value={d.status}
              disabled={locked}
              onChange={(e) => onEdit({ status: e.currentTarget.value })}
            />
          </Field>
          <Field id={`${p}-detail`} label="Detail pointer (optional)">
            <Input
              id={`${p}-detail`}
              className="font-mono"
              value={d.detail}
              disabled={locked}
              onChange={(e) => onEdit({ detail: e.currentTarget.value })}
            />
          </Field>
          <Field id={`${p}-error`} label="Error pointer (optional)">
            <Input
              id={`${p}-error`}
              className="font-mono"
              value={d.error}
              disabled={locked}
              onChange={(e) => onEdit({ error: e.currentTarget.value })}
            />
          </Field>
        </>
      ) : null}
      <p className="text-[0.7rem] text-muted-foreground">
        Runs: <code className="font-mono break-all">{argvPreview(kind)}</code>
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Input
          aria-label="Sample reference text"
          placeholder="herdr-openrig w1BA:p1"
          value={sample}
          disabled={locked}
          onChange={(e) => setSample(e.currentTarget.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={locked || dirty || testing || !sample}
          onClick={() => void test()}
        >
          Test
        </Button>
        <Button size="sm" variant="outline" disabled={locked} onClick={onRemove}>
          Remove
        </Button>
      </div>
      {dirty ? (
        <p className="text-[0.7rem] text-muted-foreground">
          Save first: Test runs the saved command.
        </p>
      ) : null}
      {result ? <TestResult result={result} rowName={row.saved?.name ?? null} /> : null}
    </fieldset>
  );
}

/** What Test returned, and which saved command produced it. */
function TestResult({
  result,
  rowName,
}: {
  result: LiveRefResult;
  rowName: string | null;
}): React.ReactElement {
  // Rust runs the first saved command whose pattern matches, which may be another row's.
  let warning: string | null = null;
  if (result.status === "unknown_ref") warning = "No saved command matches this sample.";
  else if (result.name && result.name !== rowName)
    warning = `This sample matches ${result.name}, which comes first, so that command ran instead of this one.`;
  return (
    <div role="status" className="text-xs">
      {result.name ? <p className="text-muted-foreground">Ran: {result.name}</p> : null}
      {warning ? <p className="text-destructive">{warning}</p> : null}
      <span className="font-medium">{result.status === "ok" ? result.state : result.status}</span>
      {result.status !== "ok" && result.state ? ` · ${result.state}` : ""}
      {result.detail ? (
        <pre className="mt-1 max-h-32 overflow-auto rounded border bg-muted p-1.5 font-mono text-[0.7rem] whitespace-pre-wrap">
          {result.detail}
        </pre>
      ) : null}
    </div>
  );
}
