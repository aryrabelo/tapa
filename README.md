# Tapa

A fast, minimal, Rust-based Markdown reader and editor built with Tauri + React.

> Reader-first Markdown. Native desktop, ~4 MB download, boots instantly.

## The idea

Tapa is **reader-first**. You point it at a folder of Markdown and you _read_ —
clean, rendered prose, nothing in the way. Editing is on demand, not the default
mode: double-click the exact block you want to change and you drop straight into
an editor with the cursor where you clicked. Double-click again and you are back
to reading.

The goal is the fastest, simplest, most beautiful native Markdown reader on the
desktop — native window, OS-native light/dark, instant startup, no Electron
bloat. The heavy machinery (editor engine, Markdown renderer, command palette)
is loaded only when you actually use it, so the app opens cold with a fraction
of the usual web-app weight.

## Features

- **Reader-first rendering** — open a folder (a "vault") and read rendered
  Markdown. CommonMark + GFM: headings, lists, bold/italic, links, images,
  blockquotes, tables, task lists, strikethrough, code blocks.
- **Inline edit on demand** — double-click a rendered block to edit it at the
  clicked position (CodeMirror); double-click again to return to the reader.
- **Collapsible file tree** — sidebar with the folder tree; toggle with `⌘B`.
- **Fuzzy file finder** — `⌘K` to jump between files by name.
- **Content search** — `⌘⇧F` to search inside files; matches stream in grouped
  by file with the match highlighted, and `Enter` jumps to the line.
- **Live reload** — external changes on disk reload automatically; if you have
  unsaved edits, Tapa asks before discarding them.
- **OS-native theme** — follows your system light/dark appearance, with a manual
  light / dark / system toggle.
- **Open a folder or a single file** — single files are scoped to their parent
  so save and watch keep working.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl-K` | Open the fuzzy file finder |
| `⌘⇧F` / `Ctrl-Shift-F` | Search inside files (content) |
| `⌘B` / `Ctrl-B` | Toggle the sidebar |
| `⌘S` / `Ctrl-S` | Save and return to the reader |
| Double-click | Enter edit mode at that position / exit edit mode |

## Install

Tapa runs on macOS, Linux, and Windows. Download a prebuilt installer, or build
from source — both work the same on all three platforms.

### Download a prebuilt installer

Grab the file for your platform from the
[**Releases**](https://github.com/aryrabelo/tapa/releases/latest) page:

| Platform | Download | Install |
| --- | --- | --- |
| macOS | the `.dmg` (Apple Silicon `aarch64` or Intel `x64`) | Open it, drag **Tapa** to Applications. |
| Linux | the `.AppImage` | `chmod +x Tapa_*.AppImage && ./Tapa_*.AppImage` |
| Linux (Debian/Ubuntu) | the `.deb` | `sudo apt install ./Tapa_*.deb` |
| Windows | the `.exe` or `.msi` | Run the installer. |

> The app is currently unsigned, so the OS warns on first launch: on macOS use
> right-click → **Open** to get past Gatekeeper; on Windows click
> **More info → Run anyway** in SmartScreen. Code signing is planned.

> **Note:** the first tagged release has not been published yet. Until it is,
> [build from source](#build-from-source) below.

### Build from source

#### Prerequisites

- [Node](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- Tauri v2 system prerequisites — see
  <https://v2.tauri.app/start/prerequisites/>

#### Build the app

```sh
npm install
npm run tauri build
```

The packaged app is written to
`src-tauri/target/release/bundle/` (`.app` / `.dmg` on macOS, `.deb` /
`.AppImage` on Linux, `.msi` / `.exe` on Windows).

### Run in development

```sh
npm run tauri dev
```

## How it's built

Tapa is a thin native shell around a web frontend:

- **Frontend** — React 19 + Vite, Tailwind v4 + shadcn tokens. Markdown is
  rendered in JS with `react-markdown` (remark/GFM); editing uses CodeMirror 6.
- **Backend** — Rust (Tauri v2) handles only I/O: folder scan, file read/write,
  and a filesystem watcher for live reload. No business logic lives in Rust.
- **Startup budget** — the boot bundle is aggressively code-split. The editor
  (CodeMirror), the Markdown renderer, the command palette, the sidebar, and
  toasts each load on demand instead of at startup. The result: the eager
  JS+CSS the webview parses at launch is about **34 KB gzip** — a fraction of a
  typical web-app boot bundle — while the heavy chunks stream in only when a
  feature is first used.

## Project layout

```
src/             React frontend
  components/     UI: reader, editor, sidebar, command palette
  lib/            Tauri bindings, tree/fuzzy/source-map/theme helpers
  state/          zustand store
  index.css       Tailwind v4 + shadcn tokens
src-tauri/       Rust backend (file I/O, folder scan, file watcher)
```

## Verification

```sh
npm run test            # Vitest unit tests
npm run lint            # Biome
npm run build           # tsc + Vite production build
cd src-tauri && cargo test
```

## Naming

**Tapa** is chosen for its double meaning:

- **Tapajós** — the river and region in the west of Pará, Brazil, where the
  author is from. _TAPA_, from Tapajós. The region carries its own identity:
  there is a long-running movement to carve a separate **State of Tapajós** out
  of western Pará. In Brazil's largest-ever regional plebiscite (11 December
  2011), the Tapajós region itself voted overwhelmingly to secede — the "yes"
  reached up to ~99% in some municipalities and ~80% across the region — but the
  measure was defeated statewide (~66% against), outvoted by the populous east
  around Belém. The cause is still alive in Congress: a bill (PDL 508/2019) that
  would trigger a fresh plebiscite remains before the Senate.
- **Tapa cloth** — the barkcloth of the Pacific islands, beaten from the inner
  bark of the paper-mulberry tree (_Broussonetia papyrifera_) into thin, flexible
  sheets that are then painted, stamped, and written on. Paper tree → beaten
  sheet → surface for marks: the full arc of a Markdown document. (In Portuguese,
  _tapa_ is also the _cover_ of a book — "a tapa do livro".)

The product name, the bundle identifier (`com.aryrabelo.tapa`), and the window
title are all `Tapa`. The Rust crate is still named `app` internally.

## Non-goals (v1)

- No syntax highlighting in code blocks
- No math (KaTeX)
- No diagrams (Mermaid)
- No inline per-block live preview (Typora / Obsidian style)
- No custom native window chrome (vibrancy, integrated traffic lights)
- No multi-window
- No cloud / sync

## Contributing

Bug reports, feature ideas, and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to set up the project, the
verification steps a change must pass, and the scope this project keeps (see
**Non-goals** above). Security issues: please follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE) © Ary Rabelo
