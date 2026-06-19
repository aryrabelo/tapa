// Post-build artifact size gate for the Tapa Tauri app.
//
// Block-and-ask rule:
//   When a built artifact exceeds its budget this script exits non-zero and
//   FAILS the CI job. CI must NOT auto-bump size-budget.json. A human reviews
//   the overage and decides whether the growth is acceptable; only then do they
//   edit size-budget.json by hand and commit the new baseline. Silent
//   auto-raising of the budget would defeat the entire purpose of the gate.
//
// `checkSizes` is a pure function (no I/O) so it is unit-testable; the CLI
// wrapper below does the filesystem work when this file is run directly.

import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pure budget check.
 * @param {{name: string, bytes: number}[]} entries measured artifacts
 * @param {Record<string, number>} budget max bytes keyed by artifact name
 * @returns {{ok: boolean, rows: {name: string, bytes: number, limit: number|null, over: boolean}[]}}
 */
export function checkSizes(entries, budget) {
  const rows = entries.map(({ name, bytes }) => {
    const limit = Object.prototype.hasOwnProperty.call(budget, name) ? budget[name] : null;
    const over = limit === null || bytes > limit;
    return { name, bytes, limit, over };
  });
  return { ok: rows.every((r) => !r.over), rows };
}

// ── CLI wrapper ────────────────────────────────────────────────────────────

// ponytail: simple recursive walk; a .app bundle is a few hundred files, so
// summing sizes synchronously is plenty — no streaming or parallelism needed.
function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else if (entry.isFile()) total += statSync(p).size;
    // symlinks are skipped: don't follow (avoids loops and double counting).
  }
  return total;
}

// Walk `dir` yielding every descendant path, but never descend into a *.app
// bundle (it's a leaf artifact we measure as a whole).
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      yield { path: p, isDir: true };
      if (!e.name.endsWith(".app")) yield* walk(p);
    } else {
      yield { path: p, isDir: false };
    }
  }
}

function findArtifacts(targetDir) {
  let dmg = null;
  let app = null;
  const dmgMarker = "/release/bundle/dmg/";
  const appMarker = "/release/bundle/macos/";
  for (const { path: p, isDir } of walk(targetDir)) {
    if (!dmg && !isDir && p.endsWith(".dmg") && p.includes(dmgMarker)) dmg = p;
    if (!app && isDir && p.endsWith(".app") && p.includes(appMarker)) app = p;
    if (dmg && app) break;
  }
  return { dmg, app };
}

function delta(bytes, limit) {
  if (limit === null) return "(no budget entry)";
  const d = bytes - limit;
  return `(${d >= 0 ? "+" : ""}${d})`;
}

function main() {
  const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const budgetPath = join(repoRoot, "size-budget.json");

  if (!existsSync(budgetPath)) {
    console.log("size-budget.json not found at repo root — cannot enforce size gate.");
    console.log("Create it with the post-build baseline numbers, e.g.:");
    console.log('  { "dmg": <maxBytes>, "app": <maxBytes> }');
    process.exit(2);
  }

  const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
  const targetDir = join(repoRoot, "src-tauri", "target");
  const { dmg, app } = findArtifacts(targetDir);

  const missing = [];
  if (!dmg) missing.push("dmg (src-tauri/target/**/release/bundle/dmg/*.dmg)");
  if (!app) missing.push("app (src-tauri/target/**/release/bundle/macos/*.app)");
  if (missing.length) {
    console.log(`Expected macOS artifact(s) not found: ${missing.join(", ")}`);
    console.log("Build them first, e.g. `npm run tauri build -- --bundles dmg,app`.");
    process.exit(1);
  }

  const entries = [
    { name: "dmg", bytes: statSync(dmg).size },
    { name: "app", bytes: dirSize(app) },
  ];
  const { ok, rows } = checkSizes(entries, budget);

  for (const r of rows) {
    console.log(`${r.name}: ${r.bytes} / ${r.limit ?? "?"} ${delta(r.bytes, r.limit)}`);
  }
  console.log(ok ? "Size gate: PASS" : "Size gate: FAIL — see block-and-ask rule in scripts/check-size.mjs");
  process.exit(ok ? 0 : 1);
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
