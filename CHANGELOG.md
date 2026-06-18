# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/aryrabelo/tapa/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/aryrabelo/tapa/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aryrabelo/tapa/releases/tag/v0.1.0
