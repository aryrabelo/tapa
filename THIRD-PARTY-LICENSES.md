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

## Rust crates (src-tauri/Cargo.lock)

441 distinct crates (504 crate versions resolved), grouped by SPDX license:

### MIT OR Apache-2.0 (201)

ahash, android_log-sys, android_logger, android_system_properties, anyhow, arrayvec, base64, bitflags, block-buffer, borsh, bs58, bumpalo, camino, cargo-platform, cc, cfg-expr, cfg-if, chrono, cookie, core-foundation, core-foundation-sys, core-graphics, core-graphics-types, cpufeatures, crc32fast, crossbeam-channel, crossbeam-utils, crypto-common, deranged, digest, dirs, dirs-sys, displaydoc, dtoa, dyn-clone, embed_plist, env_filter, erased-serde, errno, fdeflate, field-offset, filetime, find-msvc-tools, flate2, foreign-types, foreign-types-macros, foreign-types-shared, form_urlencoded, futures-channel, futures-core, futures-executor, futures-io, futures-macro, futures-sink, futures-task, futures-util, getrandom, glob, hashbrown, heck, hex, html5ever, http, httparse, iana-time-zone, iana-time-zone-haiku, id-arena, ident_case, idna, ipnet, itoa, jni, jni-sys, jni-sys-macros, js-sys, json-patch, jsonptr, keyboard-types, leb128fmt, libc, lock_api, log, markup5ever, mime, ndk, ndk-sys, num-conv, num-traits, num_threads, once_cell, parking_lot, parking_lot_core, percent-encoding, pkg-config, png, powerfmt, ppv-lite86, prettyplease, proc-macro-crate, proc-macro-error, proc-macro-error-attr, proc-macro2, quote, rand, rand_chacha, rand_core, ref-cast, ref-cast-impl, regex, regex-automata, regex-syntax, reqwest, rustc_version, rustversion, scopeguard, semver, serde, serde-untagged, serde_core, serde_derive, serde_derive_internals, serde_json, serde_repr, serde_spanned, serde_with, serde_with_macros, serialize-to-javascript, serialize-to-javascript-impl, servo_arc, sha2, shlex, simdutf8, siphasher, smallvec, socket2, softbuffer, stable_deref_trait, string_cache, string_cache_codegen, swift-rs, syn, system-deps, tao-macros, tempfile, tendril, thiserror, thiserror-impl, time, time-core, time-macros, toml, toml_datetime, toml_edit, toml_parser, toml_writer, tray-icon, typeid, typenum, unic-char-property, unic-char-range, unic-common, unic-ucd-ident, unic-ucd-version, unicode-segmentation, unicode-xid, url, utf-8, version_check, wasm-bindgen, wasm-bindgen-futures, wasm-bindgen-macro, wasm-bindgen-macro-support, wasm-bindgen-shared, wasm-streams, web-sys, web_atoms, winapi, winapi-i686-pc-windows-gnu, winapi-x86_64-pc-windows-gnu, windows, windows-collections, windows-core, windows-future, windows-implement, windows-interface, windows-link, windows-numerics, windows-result, windows-strings, windows-sys, windows-targets, windows-threading, windows-version, windows_aarch64_gnullvm, windows_aarch64_msvc, windows_i686_gnu, windows_i686_gnullvm, windows_i686_msvc, windows_x86_64_gnu, windows_x86_64_gnullvm, windows_x86_64_msvc

### MIT (117)

atk, atk-sys, bitvec, block2, byte-unit, bytecheck, bytecheck_derive, bytes, cairo-rs, cairo-sys-rs, cargo_metadata, cfb, cfg_aliases, combine, darling, darling_core, darling_macro, derive_more, derive_more-impl, dlopen2, dlopen2_derive, dom_query, embed-resource, fern, fsevent-sys, funty, gdk, gdk-pixbuf, gdk-pixbuf-sys, gdk-sys, gdkwayland-sys, gdkx11, gdkx11-sys, generic-array, gio, gio-sys, glib, glib-macros, glib-sys, gobject-sys, gtk, gtk-sys, gtk3-macros, http-body, http-body-util, hyper, hyper-util, ico, infer, javascriptcore-rs, javascriptcore-rs-sys, kqueue, kqueue-sys, libredox, memoffset, mio, new_debug_unreachable, objc2, objc2-encode, objc2-foundation, pango, pango-sys, phf, phf_codegen, phf_generator, phf_macros, phf_shared, plist, precomputed-hash, ptr_meta, ptr_meta_derive, quick-xml, radium, redox_syscall, redox_users, rend, rfd, rkyv, rkyv_derive, rust_decimal, schemars, schemars_derive, seahash, simd-adler32, slab, soup3, soup3-sys, strsim, synstructure, tap, tauri-winres, tokio, tokio-util, tower, tower-http, tower-layer, tower-service, tracing, tracing-core, try-lock, urlpattern, utf8-width, version-compare, vswhom, vswhom-sys, want, webkit2gtk, webkit2gtk-sys, webview2-com, webview2-com-macros, webview2-com-sys, winnow, winreg, wyz, x11, x11-dl, zmij

### Apache-2.0 OR MIT (38)

atomic-waker, autocfg, bit-set, bit-vec, cargo_toml, cesu8, ctor, ctor-proc-macro, dbus, dtor, dtor-proc-macro, equivalent, fastrand, fnv, idna_adapter, indexmap, libappindicator, libappindicator-sys, libdbus-sys, muda, pin-project-lite, rustc-hash, tauri, tauri-build, tauri-codegen, tauri-macros, tauri-plugin, tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-log, tauri-runtime, tauri-runtime-wry, tauri-utils, utf8_iter, uuid, value-bag, window-vibrancy, wry

### Unicode-3.0 (18)

icu_collections, icu_locale_core, icu_normalizer, icu_normalizer_data, icu_properties, icu_properties_data, icu_provider, litemap, potential_utf, tinystr, writeable, yoke, yoke-derive, zerofrom, zerofrom-derive, zerotrie, zerovec, zerovec-derive

### Zlib OR Apache-2.0 OR MIT (17)

bytemuck, dispatch2, objc2-app-kit, objc2-cloud-kit, objc2-core-data, objc2-core-foundation, objc2-core-graphics, objc2-core-image, objc2-core-location, objc2-core-text, objc2-exception-helper, objc2-io-surface, objc2-quartz-core, objc2-ui-kit, objc2-user-notifications, objc2-web-kit, tinyvec

### Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT (14)

linux-raw-sys, rustix, wasi, wasip2, wasip3, wasm-encoder, wasm-metadata, wasmparser, wit-bindgen, wit-bindgen-core, wit-bindgen-rust, wit-bindgen-rust-macro, wit-component, wit-parser

### Unlicense OR MIT (6)

aho-corasick, byteorder, memchr, same-file, walkdir, winapi-util

### MPL-2.0 (5)

cssparser, cssparser-macros, dtoa-short, option-ext, selectors

### Apache-2.0 (3)

borsh-derive, sync_wrapper, tao

### ISC (3)

inotify, inotify-sys, libloading

### BSD-2-Clause OR Apache-2.0 OR MIT (2)

zerocopy, zerocopy-derive

### BSD-3-Clause (2)

alloc-no-stdlib, alloc-stdlib

### BSD-3-Clause OR MIT OR Apache-2.0 (2)

num_enum, num_enum_derive

### MIT OR Apache-2.0 OR Zlib (2)

raw-window-handle, tinyvec_macros

### (MIT OR Apache-2.0) AND Unicode-3.0 (1)

unicode-ident

### 0BSD OR MIT OR Apache-2.0 (1)

adler2

### Apache-2.0 AND MIT (1)

dpi

### Apache-2.0 WITH LLVM-exception (1)

target-lexicon

### BSD-3-Clause AND MIT (1)

brotli

### BSD-3-Clause OR MIT (1)

brotli-decompressor

### CC0-1.0 (1)

notify

### CC0-1.0 OR MIT-0 OR Apache-2.0 (1)

dunce

### MIT OR Apache-2.0 OR LGPL-2.1-or-later (1)

r-efi

### MIT OR Zlib OR Apache-2.0 (1)

miniz_oxide

### Zlib (1)

foldhash

## Bundled JavaScript (package-lock.json / node_modules)

215 runtime packages bundled into the frontend, grouped by SPDX license:

### MIT (208)

@codemirror/autocomplete, @codemirror/commands, @codemirror/lang-css, @codemirror/lang-html, @codemirror/lang-javascript, @codemirror/lang-markdown, @codemirror/language, @codemirror/lint, @codemirror/search, @codemirror/state, @codemirror/view, @floating-ui/core, @floating-ui/dom, @floating-ui/react-dom, @floating-ui/utils, @lezer/common, @lezer/css, @lezer/highlight, @lezer/html, @lezer/javascript, @lezer/lr, @lezer/markdown, @marijn/find-cluster-break, @radix-ui/number, @radix-ui/primitive, @radix-ui/react-accessible-icon, @radix-ui/react-accordion, @radix-ui/react-alert-dialog, @radix-ui/react-arrow, @radix-ui/react-aspect-ratio, @radix-ui/react-avatar, @radix-ui/react-checkbox, @radix-ui/react-collapsible, @radix-ui/react-collection, @radix-ui/react-compose-refs, @radix-ui/react-context, @radix-ui/react-context-menu, @radix-ui/react-dialog, @radix-ui/react-direction, @radix-ui/react-dismissable-layer, @radix-ui/react-dropdown-menu, @radix-ui/react-focus-guards, @radix-ui/react-focus-scope, @radix-ui/react-form, @radix-ui/react-hover-card, @radix-ui/react-id, @radix-ui/react-label, @radix-ui/react-menu, @radix-ui/react-menubar, @radix-ui/react-navigation-menu, @radix-ui/react-one-time-password-field, @radix-ui/react-password-toggle-field, @radix-ui/react-popover, @radix-ui/react-popper, @radix-ui/react-portal, @radix-ui/react-presence, @radix-ui/react-primitive, @radix-ui/react-progress, @radix-ui/react-radio-group, @radix-ui/react-roving-focus, @radix-ui/react-scroll-area, @radix-ui/react-select, @radix-ui/react-separator, @radix-ui/react-slider, @radix-ui/react-slot, @radix-ui/react-switch, @radix-ui/react-tabs, @radix-ui/react-toast, @radix-ui/react-toggle, @radix-ui/react-toggle-group, @radix-ui/react-toolbar, @radix-ui/react-tooltip, @radix-ui/react-use-callback-ref, @radix-ui/react-use-controllable-state, @radix-ui/react-use-effect-event, @radix-ui/react-use-escape-keydown, @radix-ui/react-use-is-hydrated, @radix-ui/react-use-layout-effect, @radix-ui/react-use-previous, @radix-ui/react-use-rect, @radix-ui/react-use-size, @radix-ui/react-visually-hidden, @radix-ui/rect, @types/debug, @types/estree, @types/estree-jsx, @types/hast, @types/mdast, @types/ms, @types/unist, aria-hidden, bail, ccount, character-entities, character-entities-html4, character-entities-legacy, character-reference-invalid, clsx, cmdk, codemirror, comma-separated-tokens, crelt, debug, decode-named-character-reference, dequal, detect-node-es, devlop, escape-string-regexp, estree-util-is-identifier-name, extend, fault, format, get-nonce, hast-util-to-jsx-runtime, hast-util-whitespace, html-url-attributes, inline-style-parser, is-alphabetical, is-alphanumerical, is-decimal, is-hexadecimal, is-plain-obj, longest-streak, markdown-table, mdast-util-find-and-replace, mdast-util-from-markdown, mdast-util-frontmatter, mdast-util-gfm, mdast-util-gfm-autolink-literal, mdast-util-gfm-footnote, mdast-util-gfm-strikethrough, mdast-util-gfm-table, mdast-util-gfm-task-list-item, mdast-util-mdx-expression, mdast-util-mdx-jsx, mdast-util-mdxjs-esm, mdast-util-phrasing, mdast-util-to-hast, mdast-util-to-markdown, mdast-util-to-string, micromark, micromark-core-commonmark, micromark-extension-frontmatter, micromark-extension-gfm, micromark-extension-gfm-autolink-literal, micromark-extension-gfm-footnote, micromark-extension-gfm-strikethrough, micromark-extension-gfm-table, micromark-extension-gfm-tagfilter, micromark-extension-gfm-task-list-item, micromark-factory-destination, micromark-factory-label, micromark-factory-space, micromark-factory-title, micromark-factory-whitespace, micromark-util-character, micromark-util-chunked, micromark-util-classify-character, micromark-util-combine-extensions, micromark-util-decode-numeric-character-reference, micromark-util-decode-string, micromark-util-encode, micromark-util-html-tag-name, micromark-util-normalize-identifier, micromark-util-resolve-all, micromark-util-sanitize-uri, micromark-util-subtokenize, micromark-util-symbol, micromark-util-types, ms, parse-entities, property-information, radix-ui, react, react-dom, react-markdown, react-remove-scroll, react-remove-scroll-bar, react-style-singleton, remark-frontmatter, remark-gfm, remark-parse, remark-rehype, remark-stringify, scheduler, sonner, space-separated-tokens, stringify-entities, style-mod, style-to-js, style-to-object, tailwind-merge, trim-lines, trough, tw-animate-css, unified, unist-util-is, unist-util-position, unist-util-stringify-position, unist-util-visit, unist-util-visit-parents, use-callback-ref, use-sidecar, vfile, vfile-message, w3c-keyname, zustand, zwitch

### OFL-1.1 (2)

@fontsource-variable/geist, @fontsource-variable/newsreader

### 0BSD (1)

tslib

### Apache-2.0 (1)

class-variance-authority

### Apache-2.0 OR MIT (1)

@tauri-apps/api

### ISC (1)

@ungap/structured-clone

### MIT OR Apache-2.0 (1)

@tauri-apps/plugin-dialog

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
