# Tapa — Vision & AI Roadmap

> Reader-first Markdown, native, ~5 MB — and the reactive, agent-native body for
> your plain-markdown second brain.

## Positioning

Tapa = **the reactive, agent-native body for a plain-markdown second brain.** A
tiny (~5 MB) native, reader-first app whose vault is *simultaneously* a beautiful
human reading surface and a live, MCP-exposed, event-emitting runtime that AI
agents read, write, and react to — no plugin, no separate server, no host app
kept running, no proprietary DB.

It is the only contender that holds **all four corners at once**: native +
plain-`.md`-on-disk + built-in agent read/write/react + reader-first UI.

- **gbrain** is the (optional, heavy) *brain backend* — graph + retrieval +
  synthesis + 30+ MCP tools, but no reading/writing UI. Complementary, not a
  competitor. Tapa can speak MCP to it, or stand alone with a light brain.
- **Obsidian** is the caged incumbent: Electron, editor-first, full-trust
  unsandboxed JS plugins, no native agent/MCP access, and **event-blind** — it
  can describe AI-native access in a blog post but can't ship it without breaking
  its own ecosystem.

**Launch line:** *"Obsidian lets agents in the back door at full trust. Tapa
invites them through the front door — scoped, observable, and safe to write to."*
We sell Tapa as **the first agent-reactive Markdown vault**, not "another reader".

## Locked decisions (2026-06-18)

1. **Roadmap order = MCP first** (see below). The event-bus moat reaches agents
   *through* MCP resource subscriptions, and MCP is the seam everything plugs
   into, so it leads.
2. **Embedded-light brain**, not front-end-only: ship the "cheap trio" (canonical
   md + disposable index + zero-LLM wikilink graph + MCP). Independence without
   the weight. Still speaks MCP to external brains (e.g. gbrain).
3. **Adopt `[[wikilinks]]` + `^block-id`** (Obsidian-portable) as part of Tapa's
   identity — required for the cheap graph and deterministic block addressing.
4. **The moat is the narrative:** native MCP + a live line/block event bus.

## Refuse (discipline = identity)

- ❌ No Postgres / pgvector / cross-encoder reranker in the core. RAG is an
  **optional local module** (`model2vec` + `sqlite-vec` + RRF), never a dependency.
- ❌ No LLM in the binary. Synthesis / `think` / gap-analysis is the **user's own
  agent's** job via MCP — strictly more free + offline-capable than gbrain's keyed
  `think`.
- ❌ No 24/7 "dream-cycle" daemon (where gbrain's operational fragility lives).
  Enrichment is event- or user-triggered, never an always-on server.

## The cheap trio (steal from gbrain — ~80% of the value at ~5% of the weight)

1. **Plain markdown is canonical; every index is a disposable cache** rebuildable
   from the filesystem, never backed up.
2. **A zero-LLM regex pass over `[[wikilinks]]` on every write** builds a typed
   backlink graph — this is what delivers gbrain's entire +31 P@5 retrieval lift,
   at near-zero cost and zero API keys.
3. **An MCP surface** so any agent can read / search / write / patch / subscribe.

## Roadmap (ranked; each beats Obsidian for a concrete reason)

1. **In-process MCP server** (stdio sidecar over Tapa's Rust I/O). Tools:
   `read`, `search`, `list`/`structure`, `append`, `patch`, `frontmatter_query`.
   The *same* registry registration becomes a human command **and** an agent
   tool. Runs with or without the UI open. *Beats Obsidian:* no GUI, no REST
   plugin, no API key, no racing second process — Tapa is the canonical writer.
2. **Deterministic block-addressed `patch`** (reuse `src/lib/source-map.ts`) by
   `^block-id` / heading-path against the live parse tree, with an `If-Match`
   content-hash precondition. *Beats Obsidian:* their line-context patch silently
   misapplies under drift; Tapa edits by parsed identity.
3. **Line/block-state event bus (the moat).** A diff layer over the existing
   `file-changed` watcher derives `block:changed` / `task:done` /
   `frontmatter:changed`, emitted on the registry bus **and** forwarded as MCP
   `resources/updated`. *Beats Obsidian:* it has no event surface; everyone else
   polls-and-diffs.
4. **Zero-LLM wikilink/backlink typed graph** (3 regexes on `file-changed`,
   in-memory/embedded, rebuilt from FS). The cheap-trio crown jewel.
5. **Local hybrid search module** (`model2vec` + `sqlite-vec` + RRF over the
   existing Rust keyword search) — fully offline semantic recall; optional, keeps
   the ~5 MB core.
6. **Agent-safe writes:** `x-tapa.*` frontmatter provenance namespace, canonical
   serialization (one-line diffs), atomic temp+rename, `.tapa/journal` undo.

## How it stays "assembled piece-by-piece"

The in-process **registry** is the seam: each module contributes reader hooks +
agent (MCP) tools + its slice of the agent operating manual (`AGENTS.md` /
`llms.txt`). The brain a human sees and the brain an agent sees stay one thing.
