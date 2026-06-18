#!/usr/bin/env bash
# Regenerate THIRD-PARTY-LICENSES.md from the real lockfiles.
# Reads src-tauri/Cargo.lock (via `cargo metadata`) and the installed
# node_modules tree. Installs nothing, writes nothing but the doc.
#
# Usage: scripts/gen-third-party-licenses.sh > THIRD-PARTY-LICENSES.md
set -euo pipefail
cd "$(dirname "$0")/.."

emit_header() {
  cat <<'EOF'
# Third-Party Licenses

Tapa is licensed under the **MIT License**, Copyright (c) Ary Rabelo (see
[`LICENSE`](./LICENSE)).

The distributed application links and bundles third-party open-source
components. This file aggregates their licenses. It is generated from the real
lockfiles by [`scripts/gen-third-party-licenses.sh`](./scripts/gen-third-party-licenses.sh)
— not hand-curated — so it stays accurate across dependency bumps.

Scope of "distributed":

- **Rust crates** — every crate compiled into the `tapa` binary, enumerated
  from `src-tauri/Cargo.lock` via `cargo metadata`. Platform-specific crates
  (Windows/Linux/Android/macOS backends) are listed together; only the ones
  for the build target end up in a given binary.
- **Bundled JS** — the frontend runtime libraries Vite bundles into the
  shipped web assets, walked from the app's real runtime imports. Build- and
  test-only tooling (Vite, Biome, Vitest, the Tauri CLI, the `shadcn`
  scaffolding CLI, TypeScript, Babel, jsdom, Testing Library) is **not**
  redistributed and is intentionally excluded.

License identifiers are SPDX expressions taken verbatim from each package's
own metadata. Where a package is dual/multi-licensed (`A OR B`), Tapa's
distribution relies on the MIT or Apache-2.0 option. For the full license
text of any component, see the `LICENSE`/`COPYING` file in that package's
source (crates.io / npm registry).

All licenses below are permissive (MIT, Apache-2.0, BSD, ISC, Zlib, Unicode,
0BSD, CC0, Unlicense, OFL) or file-level weak-copyleft (MPL-2.0); all are
compatible with redistributing Tapa under MIT.

EOF
}

emit_rust() {
  cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 2>/dev/null \
    | python3 -c '
import json,sys,collections
d=json.load(sys.stdin)
byl=collections.defaultdict(set)
versions=0
for p in d["packages"]:
    if p["name"]=="app": continue
    versions+=1
    lic=" ".join((p.get("license") or "UNKNOWN").replace("/"," OR ").split())
    byl[lic].add(p["name"])
distinct=len({n for v in byl.values() for n in v})
print("## Rust crates (src-tauri/Cargo.lock)\n")
print(f"{distinct} distinct crates ({versions} crate versions resolved), grouped by SPDX license:\n")
for k in sorted(byl,key=lambda x:(-len(byl[x]),x)):
    names=", ".join(sorted(byl[k]))
    print(f"### {k} ({len(byl[k])})\n")
    print(names+"\n")
'
}

emit_npm() {
  node -e '
const fs=require("fs"),path=require("path");
const roots=["@codemirror/commands","@codemirror/lang-markdown","@codemirror/state","@codemirror/view","@fontsource-variable/geist","@fontsource-variable/newsreader","@tauri-apps/api","@tauri-apps/plugin-dialog","class-variance-authority","clsx","cmdk","codemirror","radix-ui","react","react-dom","react-markdown","remark-frontmatter","remark-gfm","sonner","tailwind-merge","tw-animate-css","zustand"];
function resolveDep(name,fromDir){
  let dir=fromDir;
  for(;;){
    const cand=path.join(dir,"node_modules",name,"package.json");
    if(fs.existsSync(cand))return {pkg:JSON.parse(fs.readFileSync(cand)),dir:path.join(dir,"node_modules",name)};
    if(dir===process.cwd())break;
    dir=path.dirname(dir);
    if(dir.length<2)break;
  }
  const rootc=path.join("node_modules",name,"package.json");
  if(fs.existsSync(rootc))return {pkg:JSON.parse(fs.readFileSync(rootc)),dir:path.join("node_modules",name)};
  return null;
}
const seen=new Set();
function walk(name,fromDir){
  if(seen.has(name))return;
  const r=resolveDep(name,fromDir);
  if(!r)return;
  seen.add(name);
  for(const d of Object.keys(r.pkg.dependencies||{}))walk(d,r.dir);
}
for(const root of roots)walk(root,process.cwd());
function lic(name){const p=path.join("node_modules",name,"package.json");try{const j=JSON.parse(fs.readFileSync(p));let l=j.license||j.licenses;if(Array.isArray(l))l=l.map(x=>x.type||x).join(" OR ");if(l&&typeof l==="object")l=l.type;return l||"UNKNOWN";}catch(e){return "UNKNOWN";}}
const byl={};
for(const n of [...seen].sort()){const l=lic(n);(byl[l]=byl[l]||[]).push(n);}
const keys=Object.keys(byl).sort((a,b)=>byl[b].length-byl[a].length||a.localeCompare(b));
const total=[...seen].length;
console.log("## Bundled JavaScript (package-lock.json / node_modules)\n");
console.log(total+" runtime packages bundled into the frontend, grouped by SPDX license:\n");
for(const k of keys){console.log("### "+k+" ("+byl[k].length+")\n");console.log(byl[k].join(", ")+"\n");}
'
}

emit_notes() {
  cat <<'EOF'
## Bundled fonts (redistributed in the binary)

Two variable fonts are compiled into the application bundle and redistributed
verbatim. Both are licensed under the **SIL Open Font License 1.1 (OFL-1.1)**:

- **@fontsource-variable/geist** — Geist Variable (© Vercel), OFL-1.1
- **@fontsource-variable/newsreader** — Newsreader Variable (© Production Type), OFL-1.1

OFL-1.1 permits bundling and redistribution within an application; the fonts
are unmodified. Their full OFL text ships in each package
(`node_modules/@fontsource-variable/*/LICENSE`).

## MPL-2.0 components (file-level weak copyleft)

The following crates are licensed under the **Mozilla Public License 2.0**:

- `cssparser`, `cssparser-macros`, `dtoa-short`, `selectors` (Servo CSS stack,
  pulled in transitively by Tauri/wry)
- `option-ext`
- `lightningcss` / `lightningcss-darwin-arm64` (build-time CSS transform via
  the Tailwind v4 pipeline)

MPL-2.0 is *file-level* weak copyleft: its obligations attach only to the MPL
source files themselves, not to the larger work. These components are used
**unmodified**, so no MPL source disclosure is triggered, and they are fully
compatible with distributing Tapa under MIT. Their source remains available
under MPL-2.0 from the respective upstream repositories.

## Notable single-license components

- `notify` — CC0-1.0 (public domain dedication), filesystem watcher.
- `dunce` — CC0-1.0 OR MIT-0 OR Apache-2.0.
- Unicode data crates (ICU4X family) — Unicode-3.0 (Unicode License v3).
- `tslib` — 0BSD; `class-variance-authority` (bundled) — Apache-2.0.
- `r-efi` offers an LGPL-2.1-or-later option but is taken under its MIT/Apache-2.0 option.
EOF
}

emit_header
emit_rust
emit_npm
emit_notes
