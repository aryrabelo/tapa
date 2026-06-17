# Contributing to Tapa

Thanks for taking the time to contribute. Tapa is a small, focused Markdown
reader, and keeping it small is a feature — please read the **Non-goals** in the
[README](README.md#non-goals-v1) before proposing large additions.

## Ways to help

- **Report a bug** — open an issue with steps to reproduce, your OS, and what you
  expected to happen.
- **Suggest a feature** — open an issue describing the problem you're trying to
  solve, not just the solution. Features that fit the reader-first scope are the
  easiest to land.
- **Send a pull request** — fixes, small improvements, and docs are all welcome.
  For anything large, open an issue first so we can agree on the approach.

## Development setup

Prerequisites:

- [Node](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- Tauri v2 system prerequisites — see <https://v2.tauri.app/start/prerequisites/>

Then:

```sh
npm install
npm run tauri dev      # run the app with hot reload
```

## Before you open a pull request

Every change must pass the same checks CI runs:

```sh
npm run lint                         # Biome
npm run test                         # Vitest
npm run build                        # tsc + Vite production build
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

`npm run format` applies the Biome formatter for you.

## Project layout

```
src/         React frontend (reader, editor, sidebar, command palette)
src-tauri/   Rust backend — file I/O, folder scan, filesystem watcher only
```

Business logic lives in the frontend; the Rust side is intentionally limited to
I/O. New features should follow that split.

## Pull request guidelines

- Keep PRs focused — one logical change per PR.
- Match the existing code style; the linters above are the source of truth.
- Update the README or other docs when behavior changes.
- Add or update tests when you change behavior.
- Write clear commit messages explaining the *why*, not just the *what*.

## Code of conduct

Be respectful and constructive. We're here to build a good tool together.
