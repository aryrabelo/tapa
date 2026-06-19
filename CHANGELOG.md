# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/aryrabelo/tapa/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/aryrabelo/tapa/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/aryrabelo/tapa/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aryrabelo/tapa/releases/tag/v0.1.0
