import type * as React from "react";
import { useEffect, useState } from "react";
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

/** Settings section for live references. Loaded only while the plugin is on. */
export default function LiveRefsSettings(): React.ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean; row?: number } | null>(null);

  useEffect(() => {
    liveRefsConfig().then(
      (c) => setRows(c.kinds.map((k) => ({ id: nextId++, draft: toDraft(k), saved: k }))),
      (e: unknown) => {
        setLoadError(String(e));
        setRows([]);
      },
    );
  }, []);

  if (!rows) return <p className="text-xs text-muted-foreground">Loading…</p>;

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
      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
      {rows.map((row) => (
        <KindRow
          key={row.id}
          row={row}
          onEdit={(patch) => edit(row.id, patch)}
          onRemove={() => setRows((rs) => rs?.filter((r) => r.id !== row.id) ?? rs)}
          error={notice?.error && notice.row === row.id ? notice.text : null}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setRows((rs) => [...(rs ?? []), { id: nextId++, saved: null, draft: { ...BLANK } }])
          }
        >
          Add command
        </Button>
        <Button size="sm" variant="outline" onClick={() => void addBora()}>
          Add bora pane
        </Button>
        <Button size="sm" disabled={saving} onClick={() => void save()}>
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
  onEdit,
  onRemove,
  error,
}: {
  row: Row;
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
    const name = d.program.trim().split("/").pop() ?? "";
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
          onChange={(next) => onEdit({ enabled: next })}
          aria-label={`Turn ${d.name || "this command"} on or off`}
        />
      </div>
      <Field id={`${p}-name`} label="Name">
        <Input
          id={`${p}-name`}
          value={d.name}
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
            onChange={(e) => onEdit({ program: e.currentTarget.value })}
          />
          <Button size="sm" variant="outline" onClick={() => void find()}>
            Find
          </Button>
        </div>
      </Field>
      <Field id={`${p}-args`} label="Arguments, one per line ({1} to {4} = parts of the reference)">
        <textarea
          id={`${p}-args`}
          className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-xs"
          value={d.args}
          onChange={(e) => onEdit({ args: e.currentTarget.value })}
        />
      </Field>
      <div className="flex gap-2">
        <Field id={`${p}-interval`} label="Every (seconds)">
          <Input
            id={`${p}-interval`}
            inputMode="numeric"
            value={d.intervalSec}
            onChange={(e) => onEdit({ intervalSec: e.currentTarget.value })}
          />
        </Field>
        <Field id={`${p}-timeout`} label="Give up after (ms)">
          <Input
            id={`${p}-timeout`}
            inputMode="numeric"
            value={d.timeoutMs}
            onChange={(e) => onEdit({ timeoutMs: e.currentTarget.value })}
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-foreground">Output is JSON</span>
        <Switch
          checked={d.json}
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
              onChange={(e) => onEdit({ status: e.currentTarget.value })}
            />
          </Field>
          <Field id={`${p}-detail`} label="Detail pointer (optional)">
            <Input
              id={`${p}-detail`}
              className="font-mono"
              value={d.detail}
              onChange={(e) => onEdit({ detail: e.currentTarget.value })}
            />
          </Field>
          <Field id={`${p}-error`} label="Error pointer (optional)">
            <Input
              id={`${p}-error`}
              className="font-mono"
              value={d.error}
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
          onChange={(e) => setSample(e.currentTarget.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={dirty || testing || !sample}
          onClick={() => void test()}
        >
          Test
        </Button>
        <Button size="sm" variant="outline" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {dirty ? (
        <p className="text-[0.7rem] text-muted-foreground">
          Save first: Test runs the saved command.
        </p>
      ) : null}
      {result ? (
        <div role="status" className="text-xs">
          <span className="font-medium">
            {result.status === "ok" ? result.state : result.status}
          </span>
          {result.status !== "ok" && result.state ? ` · ${result.state}` : ""}
          {result.detail ? (
            <pre className="mt-1 max-h-32 overflow-auto rounded border bg-muted p-1.5 font-mono text-[0.7rem] whitespace-pre-wrap">
              {result.detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
