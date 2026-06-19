# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-19

### Added
- New File (`⌘N`): a "New File" item in the native **File** menu creates a blank
  Markdown file — it prompts for a save location, writes the empty file, and
  opens it straight into edit mode. Menu-only, in keeping with the minimal UI.
- Settings panel (`⌘,`): a modal with a Light / Dark / System theme switch, the
  keyboard-shortcut reference, and an Agent-access (MCP) note. First-party
  `settings` registry module; opens via `⌘,`, the command palette, or the
  right-click menu; `Esc` or a backdrop click closes it.
- Live sidebar refresh: the file tree now updates in place when files are added
  or removed on disk (e.g. by an agent), not only when the active file changes.
- Agent-driven focus: `tapa-mcp` gains a `focus` tool that writes
  `.tapa/control.json`; the running app watches that file and opens / focuses the
  requested note — the first agent→UI control channel. Zero new deps, available
  without `--write`.

### Fixed
- Live-write (`⌘⇧L`) did nothing when launched from a click (right-click menu or
  command palette): the launching click reached the click-to-stop handler and
  tore the session down before the first reveal. It now ignores clicks until the
  first block has revealed; a later click still stops it as before.

## [0.2.3] - 2026-06-19

### Fixed
- macOS builds are now Developer ID signed, notarized, and stapled in CI. The
  v0.2.2 build predated the signing credentials, so its `.app`/`.dmg` shipped
  ad-hoc signed and unnotarized, which made macOS Gatekeeper refuse to open them
  ("Apple could not verify Tapa is free of malware"). No code change — this is a
  re-release of 0.2.2 with the correct signing pipeline.

## [0.2.2] - 2026-06-19

### Added
- Optional `tapa-mcp` binary: a Model Context Protocol server (stdio JSON-RPC)
  that exposes the vault to AI agents with read-only tools `list`, `read`, and
  `search`. **Opt-in and not bundled** with the app — build it separately and
  point your agent at it. Reuses the app's Rust I/O; zero new runtime
  dependencies; reads are guarded against path traversal outside the vault.
- `tapa-mcp` write tools `append` and `patch`, gated behind a `--write` flag
  (read-only by default). `patch` addresses a block by `^block-id` or a section
  by heading and requires an `if_match` precondition (the region's current
  text), refusing on drift; writes are atomic (temp + rename). Still zero new
  dependencies.
- In-file find (`⌘F`): finds within the open document in reader mode and
  highlights every match in place (CSS Custom Highlight API, no DOM mutation);
  `Enter` / `⇧Enter` step through matches, `Esc` closes. `⌘⇧F` (whole-vault
  search) is unchanged. Built as a first-party `find` registry module.
- `tapa-mcp` MCP resources + live subscriptions: `resources/list` / `read` plus
  `resources/subscribe` / `unsubscribe`, backed by a filesystem watcher that
  pushes `notifications/resources/updated` when a subscribed file changes on
  disk (and `resources/list_changed` on add/remove) — reactive, no polling.
  Available without `--write`; zero new dependencies.
- Auto-update: a **Check for Updates** command/menu item that pulls signed
  releases from GitHub Releases (`latest.json`) via the Tauri updater plugin,
  downloads, installs, and relaunches. Fails closed — an unsigned/unverified
  build can never install. Desktop-only; requires a one-time signing-key setup
  (see README → Auto-update & releasing).
- Weekly scheduled CI (`.github/workflows/weekly.yml`): artifacts-only build
  across macOS (aarch64 + x86_64), Linux, and Windows every Monday, uploaded for
  inspection.
- Post-build **artifact size gate** (`scripts/check-size.mjs` + `size-budget.json`):
  CI fails when the macOS `.dmg` or `.app` exceeds its committed budget. The
  budget is never auto-raised — a human reviews any growth and bumps it by hand
  (block-and-ask). Runs in CI and in the weekly build.

### Fixed
- Release/bundle builds failed with "failed to find main binary" after the
  `tapa-mcp` binary was added; set `default-run = "app"` so the bundler picks the
  app binary.

## [0.2.1] - 2026-06-18

### Changed
- The default webview right-click menu is now suppressed in the reader; native
  menus are kept in editable fields (search inputs, the editor). A custom in-app
  context menu is planned.
- macOS DMG: a custom installer background; the volume-icon helper file no longer
  shows in the mount window.

## [0.2.0] - 2026-06-18

### Added
- Content search (`⌘⇧F` / `Ctrl-Shift-F`): streams matches from Rust grouped by
  file with line snippets and match highlight; `Enter` jumps to the line. Built
  as the first module on a new in-process module registry (extensibility seam).

### Changed
- Size-optimized release build profile (`opt-level=s`, LTO, `codegen-units=1`,
  `panic=abort`, `strip`): the release binary is ~53% smaller (11.6 MB → 5.5 MB),
  shrinking the installers accordingly.
- Keybinding dispatch is now allocation-free on the typing hot path.

## [0.1.0] - 2026-06-18

### Added
- Reader-first Markdown rendering for a folder ("vault") with CommonMark + GFM.
- Inline edit on demand: double-click a rendered block to edit at the clicked
  position (CodeMirror); double-click again to return to the reader.
- Collapsible file tree with a sidebar toggle (`⌘B` / `Ctrl-B`).
- Fuzzy file finder (`⌘K` / `Ctrl-K`).
- Live reload of external on-disk changes, with a prompt before discarding
  unsaved edits.
- OS-native light/dark theme with a manual light / dark / system toggle.
- Open a single file or a whole folder; single files are scoped to their parent
  so save and watch keep working.
- macOS file association: register Tapa as a reader for `.md` / `.markdown`.

### Notes
- Code-split boot bundle: the eager JS+CSS parsed at launch is ~34 KB gzip.

[Unreleased]: https://github.com/aryrabelo/tapa/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/aryrabelo/tapa/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/aryrabelo/tapa/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/aryrabelo/tapa/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/aryrabelo/tapa/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/aryrabelo/tapa/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aryrabelo/tapa/releases/tag/v0.1.0
