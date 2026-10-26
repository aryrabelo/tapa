# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **AI suggestions** (optional, off by default): when your notes have no
  suggestion and you pause typing, Tapa can ask OpenAI or Anthropic for one
  short sentence, shown as the same gray ghost with a faint dotted underline.
  `Tab` keeps it and `Esc` hides it, as before. Turn it on in Settings with
  your own API key; the key is kept in the system keychain (macOS Keychain,
  Windows Credential Manager, Linux Secret Service) and is never shown again.
  Only the text around the caret (about 1,500 characters before, 300 after)
  is sent, and nothing is sent while it is off. Defaults: `gpt-6-luna` and
  `claude-haiku-5-5`, or any model you name.

### Changed
- Autocomplete now also learns from your other open files and your recent
  Markdown files, not only the open folder, so a file opened on its own from
  Finder gets suggestions too. They are read in the background; a file that
  can't be read is skipped.

## [0.8.0] - 2026-10-26

### Added
- **Review changes in the text** (`⌘⇧R`, or **Review in the text** in What
  changed): the open note shows its changes since the last commit, or since
  you opened it, in place. Added text is tinted and removed text stays struck
  through. Each change has **Keep** and **Undo**, and the bar on top has
  **Keep all**, **Undo all** and **Done** (`Esc`). Undo is an ordinary edit
  that saves and `⌘Z` brings back; Keep only stops showing the change, it
  never touches the file or Git. A table with a change shows its Markdown
  while you review, so the change is visible. The review code loads the first
  time you use it.

### Changed
- Opening a file from Finder (or Open…, drag & drop, Open Recent) while other
  loose files are open no longer replaces them: each one joins the sidebar list,
  like a tab, and a click switches back. Close Note (`⌘W`) removes a file from
  the list and opens the next one. The list comes back on the next launch.

## [0.7.0] - 2026-10-22

### Added
- **What changed** (`⌘⇧G`): lists the
  sentences you added and removed in the open note, without Markdown symbols
  or a diff. Tables show cell text. The earlier version is the last Git commit
  when the folder is a repository, otherwise the copy Tapa kept when you opened
  the note. It can be switched off in Settings.

## [0.6.0] - 2026-10-19

### Added
- A full menu bar. **File:** New File, Open… (`⌘O`), Open Folder… (`⌘⇧O`),
  Open Recent, Save, Save As… (`⌘⇧S`), Rename…, Show in Finder, Move to
  Trash, Close Note (`⌘W`) and Close Window (`⌘⇧W`). **Edit:** Find, Find and
  Replace (`⌘⌥F`), Search in Files. **View:** sidebar, Go to File (`⌘K`),
  bigger and smaller text (`⌘=`, `⌘-`, `⌘0`), Focus Mode. **Help:** Keyboard
  Shortcuts and the project page. Settings… and Check for Updates… are in the
  Tapa menu.
- The full path of the open note is shown at the top (home as `~`); click it
  to copy it. The window title shows the note and its folder, with "Edited"
  while there are unsaved changes.
- Tapa reopens the last folder and note when it starts. The start screen has
  Open File…, Open Folder… and your recent files and folders.
- Notes save on their own a moment after you stop typing, before switching
  to another note, and before the window closes.
- Drag a Markdown file or a folder onto the window to open it.
- Find and Replace, with Replace All as one undo step and a Match case option.
- Text size from 80% to 200%, remembered between launches.
- Tapa checks for updates once a day and only says something when there is one.

### Fixed
- Opening the file finder, the find bar or the rename box now puts the
  keyboard in it. Before, what you typed could go into the note behind it.
- Closing one of them gives the keyboard back to the note, so typing and
  shortcuts such as `⌘W` keep working without a click.

## [0.5.0] - 2026-10-18

### Added
- Focus plugin (off by default, `⌘⇧D` turns it on or off): the sentence under
  the caret stays dark and the rest of the note fades, and the caret becomes a
  thicker line that does not blink, so it is easy to find. The caret's line
  also stays in the middle of the window while you type or move with the arrow
  keys. Fading and centring each have their own switch in Settings. A code
  block stays lit as a whole while the caret is in it.
- Autocomplete plugin (on by default): while you type, the rest of the
  sentence appears in gray, taken from the other notes in the open folder and
  the note itself. If the notes finish the word in different ways, it picks the
  most common one; if the sentence then goes on differently, it offers only the
  words they share after that word, or just the word. Tab keeps it, Esc hides
  it. The text Tab adds flashes in a rainbow gradient for about a second and a
  half, then turns into normal text, so you see what was added. Nothing is sent
  over the network.

### Fixed
- Saving a note can no longer leave it empty or half-written. The new text goes
  to a hidden temp file in the same folder, is flushed to disk, and only then
  replaces the note in one rename. A failed save leaves the old note as it was.
  Permissions and symlinks are kept, and a read-only note is refused as before.
  Saving no longer re-scans the sidebar tree.

## [0.4.0] - 2026-10-17

### Changed
- One always-editable surface. The separate reader, the double-click that left
  the note, react-markdown, and the source map are gone. The header shows the
  note's title and Saved / Saving… / Unsaved. Markdown symbols stay hidden until
  you click or type.
- Plugins load from a manifest, and only when they are on. Formatted reading and
  tables are the first plugins (on by default). Teleprompter and Brain stay off
  until you turn them on. Turning a plugin off removes the commands it added
  while it was active.
- The AssemblyAI token mint, and the dotenv/rustls startup it needed, sit
  behind the `dev-capture` cargo feature. A normal build leaves them out.

### Removed
- Live-write and Presentation. They only animated the old reader.
- The welcome-screen Open Brain button, the header's duplicate Open buttons,
  the decorative ⌘K badge, and the second theme control.

### Added
- Tables render as real tables in the editor, not as raw `| pipes |`. Click a
  cell to edit that table's source with the caret in the clicked cell; move the
  caret out and it renders again. The editor parses GFM (tables, strikethrough,
  task lists). The table look is a header band, zebra rows, column rules, sans
  14px, and horizontal scroll for wide tables.
- Sidebar "+" beside the **Files** header creates a new file or folder *inside
  the open folder* (e.g. the Brain vault) — no more native Save dialog that
  defaults to an unrelated directory. Type a name and press Enter; end it with
  `/` for a folder, and nested paths (`topics/idea.md`) create intermediate
  dirs. New files open straight into edit mode. Backed by a `create_path`
  command (parent-creating, refuses to clobber an existing file).
- Teleprompter (`⌘⇧T`): a macOS overlay that auto-scrolls the open document as
  plain text so you can read while looking at the camera. It rides in the notch
  zone above the menu bar, floats over fullscreen apps, and never steals
  keyboard focus (a non-activating `NSPanel`). Hover for play/pause, speed, font
  and mirror controls; `Space` pauses, `↑`/`↓` change speed, `Esc` closes.
  First-party `teleprompter` registry module; opens via `⌘⇧T`, the command
  palette, or the right-click menu. Off until you turn it on in Settings.
- Brain (`⌘⇧B` open / `⌘⇧I` capture): a default git-backed plain-Markdown ideas
  vault at `~/brain`, kept outside any project repo. `⌘⇧B` opens the vault in
  Tapa; `⌘⇧I` captures a fresh inbox note (`inbox/YYYY-MM-DD-<hash>.md`, seeded
  with a Compiled-truth + Timeline scaffold) and drops you straight into edit
  mode. The vault is created and `git init`'d on first use. First-party `brain`
  registry module; both actions are also in the right-click "Tools" menu. Off
  until you turn it on in Settings.

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

[Unreleased]: https://github.com/aryrabelo/tapa/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/aryrabelo/tapa/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/aryrabelo/tapa/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/aryrabelo/tapa/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/aryrabelo/tapa/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/aryrabelo/tapa/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aryrabelo/tapa/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/aryrabelo/tapa/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/aryrabelo/tapa/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/aryrabelo/tapa/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/aryrabelo/tapa/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aryrabelo/tapa/releases/tag/v0.1.0
