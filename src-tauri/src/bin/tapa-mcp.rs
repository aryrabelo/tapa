//! `tapa-mcp` — a Model Context Protocol server over stdio for a Markdown vault.
//!
//! Newline-delimited JSON-RPC 2.0 on stdin/stdout, no async, no extra deps.
//! Read-only tools: `list`, `read`, `search`. Reuses `app_lib`'s pure fns.

use app_lib::fs_tree::scan_markdown;
use app_lib::search::{search_dir, Hit, SearchOpts};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

/// 5 MB per-file guard, mirrors `commands.rs`.
const MAX_BYTES: u64 = 5 * 1024 * 1024;
/// Cap on hits returned by a single `search` call.
const MAX_HITS: usize = 200;

const DEFAULT_PROTOCOL: &str = "2024-11-05";

fn ok(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn err(id: Value, code: i64, msg: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } })
}

/// `{ "content": [{ "type": "text", "text": <text> }], "isError": <is_error> }`
fn tool_result(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

/// JSON Schema for each tool's arguments.
fn tools_schema(writable: bool) -> Value {
    let mut tools = vec![
        json!({
            "name": "list",
            "description": "List all Markdown files in the vault (paths relative to the vault root).",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "read",
            "description": "Read a Markdown file's contents by its vault-relative path.",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        }),
        json!({
            "name": "search",
            "description": "Full-text search across the vault's Markdown files; returns path:line:col matches.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "regex": { "type": "boolean" }
                },
                "required": ["query"]
            }
        }),
    ];
    if writable {
        tools.push(json!({
            "name": "append",
            "description": "Append text to a Markdown file (creates it if missing).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"]
            }
        }));
        tools.push(json!({
            "name": "patch",
            "description": "Replace a block (by ^block-id) or a section (by heading) in a Markdown file; if_match must equal the region's current text (optimistic concurrency). Exactly one of 'block' or 'heading' is required.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" },
                    "if_match": { "type": "string" },
                    "block": { "type": "string" },
                    "heading": { "type": "string" }
                },
                "required": ["path", "content", "if_match"]
            }
        }));
    }
    Value::Array(tools)
}

fn tool_list(vault: &Path) -> Result<String, String> {
    Ok(scan_markdown(vault).join("\n"))
}

fn tool_read(vault: &Path, args: &Value) -> Result<String, String> {
    let rel = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or("missing 'path' argument")?;
    let target = vault.join(rel);
    // Canonicalize both sides so traversal (`../secret.md`) and symlinks cannot
    // escape the vault root.
    let canon_vault = vault.canonicalize().map_err(|e| e.to_string())?;
    let canon_target = target.canonicalize().map_err(|e| e.to_string())?;
    if !canon_target.starts_with(&canon_vault) {
        return Err("path escapes the vault root".to_string());
    }
    let meta = std::fs::metadata(&canon_target).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "File too large ({} bytes); over 5 MB guard",
            meta.len()
        ));
    }
    std::fs::read_to_string(&canon_target).map_err(|_| "Not a UTF-8 text file".to_string())
}

fn tool_search(vault: &Path, args: &Value) -> Result<String, String> {
    let query = args
        .get("query")
        .and_then(Value::as_str)
        .ok_or("missing 'query' argument")?;
    let regex = args.get("regex").and_then(Value::as_bool).unwrap_or(false);
    let mut hits: Vec<Hit> = Vec::new();
    let mut sink = |h: Hit| {
        hits.push(h);
        hits.len() < MAX_HITS
    };
    search_dir(vault, query, &SearchOpts { regex }, &mut sink)?;
    if hits.is_empty() {
        return Ok("No matches.".to_string());
    }
    let lines: Vec<String> = hits
        .iter()
        .map(|h| format!("{}:{}:{}: {}", h.path, h.line, h.col, h.snippet))
        .collect();
    Ok(lines.join("\n"))
}

/// Resolve a vault-relative path for a *create-capable* write. The file itself
/// need not exist, but its parent directory must, and must canonicalize to a
/// location inside the vault — this allows new files in existing in-vault dirs
/// while blocking `..` traversal and symlink escapes.
fn resolve_writable(vault: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() {
        return Err("missing 'path' argument".to_string());
    }
    if rel.split(['/', '\\']).any(|c| c == "..") {
        return Err("path escapes the vault root".to_string());
    }
    let target = vault.join(rel);
    let parent = target
        .parent()
        .ok_or("path has no parent directory".to_string())?;
    let file_name = target
        .file_name()
        .ok_or("path has no file name".to_string())?;
    let canon_vault = vault.canonicalize().map_err(|e| e.to_string())?;
    let canon_parent = parent.canonicalize().map_err(|e| e.to_string())?;
    if !canon_parent.starts_with(&canon_vault) {
        return Err("path escapes the vault root".to_string());
    }
    Ok(canon_parent.join(file_name))
}

/// Resolve a vault-relative path that MUST already exist, mirroring `tool_read`'s
/// canonicalize-both-sides guard.
fn resolve_existing(vault: &Path, rel: &str) -> Result<PathBuf, String> {
    let target = vault.join(rel);
    let canon_vault = vault.canonicalize().map_err(|e| e.to_string())?;
    let canon_target = target.canonicalize().map_err(|e| e.to_string())?;
    if !canon_target.starts_with(&canon_vault) {
        return Err("path escapes the vault root".to_string());
    }
    Ok(canon_target)
}

/// Write `content` durably: write to a sibling temp file in the same directory,
/// then atomically `rename` over the target (atomic within one filesystem).
// ponytail: pid-suffixed temp name; swap to a per-write uuid if concurrent
// writers to the same file ever become a real scenario.
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or("path has no parent directory".to_string())?;
    let base = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("path has no file name".to_string())?;
    let tmp = dir.join(format!(".{}.tapa-tmp-{}", base, std::process::id()));
    let write_then_rename = || -> Result<(), String> {
        std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, path).map_err(|e| e.to_string())
    };
    write_then_rename().inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

fn tool_append(vault: &Path, args: &Value) -> Result<String, String> {
    let rel = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or("missing 'path' argument")?;
    let new = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or("missing 'content' argument")?;
    let target = resolve_writable(vault, rel)?;
    let old = std::fs::read_to_string(&target).unwrap_or_default();
    let composed = if old.trim_end().is_empty() {
        format!("{}\n", new.trim_end())
    } else {
        format!("{}\n\n{}\n", old.trim_end(), new.trim_end())
    };
    atomic_write(&target, &composed)?;
    Ok(format!("Appended to {rel}."))
}

fn tool_patch(vault: &Path, args: &Value) -> Result<String, String> {
    let rel = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or("missing 'path' argument")?;
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or("missing 'content' argument")?;
    let if_match = args
        .get("if_match")
        .and_then(Value::as_str)
        .ok_or("missing 'if_match' argument")?;
    let block = args.get("block").and_then(Value::as_str);
    let heading = args.get("heading").and_then(Value::as_str);
    let address = match (block, heading) {
        (Some(_), Some(_)) => {
            return Err("provide exactly one of 'block' or 'heading', not both".to_string())
        }
        (None, None) => return Err("provide exactly one of 'block' or 'heading'".to_string()),
        (Some(b), None) => Address::Block(b),
        (None, Some(h)) => Address::Heading(h),
    };

    let target = resolve_existing(vault, rel)?;
    let text = std::fs::read_to_string(&target).map_err(|_| "Not a UTF-8 text file".to_string())?;
    let had_trailing_newline = text.ends_with('\n');
    let lines: Vec<&str> = text.split('\n').collect();

    let (start, end) = match address {
        Address::Heading(h) => find_heading_region(&lines, h)?,
        Address::Block(b) => find_block_region(&lines, b)?,
    };

    let current_region = lines[start..end].join("\n");
    if current_region.trim_end() != if_match.trim_end() {
        return Err(format!(
            "if_match mismatch (region changed); current region:\n{current_region}"
        ));
    }

    let mut out: Vec<&str> = Vec::with_capacity(lines.len());
    out.extend_from_slice(&lines[..start]);
    let replacement: Vec<&str> = content.split('\n').collect();
    out.extend_from_slice(&replacement);
    out.extend_from_slice(&lines[end..]);
    let mut joined = out.join("\n");
    if had_trailing_newline && !joined.ends_with('\n') {
        joined.push('\n');
    }
    atomic_write(&target, &joined)?;
    Ok(format!("Patched {rel}."))
}

enum Address<'a> {
    Block(&'a str),
    Heading(&'a str),
}

/// Count of leading `#` if the line is an ATX heading (`#`..`######` followed by
/// a space or end-of-line), else `None`.
fn atx_level(line: &str) -> Option<usize> {
    let hashes = line.chars().take_while(|&c| c == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    match line[hashes..].chars().next() {
        None | Some(' ') => Some(hashes),
        _ => None,
    }
}

/// Heading text: strip leading `#`s and one space, then trim.
fn heading_text(line: &str) -> &str {
    line.trim_start_matches('#').trim()
}

/// `[start, end)` line range of a section's body: the lines after the matching
/// heading up to (exclusive) the next heading of level <= it, or EOF.
fn find_heading_region(lines: &[&str], heading: &str) -> Result<(usize, usize), String> {
    let want = heading.trim();
    let h_idx = lines
        .iter()
        .position(|l| atx_level(l).is_some() && heading_text(l) == want)
        .ok_or_else(|| format!("heading not found: {want}"))?;
    let level = atx_level(lines[h_idx]).unwrap();
    let mut start = h_idx + 1;
    let mut end = start;
    while end < lines.len() {
        if let Some(l) = atx_level(lines[end]) {
            if l <= level {
                break;
            }
        }
        end += 1;
    }
    // Narrow to the body's non-blank span so `if_match` compares against the
    // visible text, not the blank lines that pad the section.
    while start < end && lines[start].trim().is_empty() {
        start += 1;
    }
    while end > start && lines[end - 1].trim().is_empty() {
        end -= 1;
    }
    Ok((start, end))
}

/// `[start, end)` line range of the paragraph (maximal run of consecutive
/// non-blank lines) that contains the block-id line.
// ponytail: paragraph-run heuristic; reach for a real Markdown parser if
// list-item or precise block extents ever need to be addressed.
fn find_block_region(lines: &[&str], block: &str) -> Result<(usize, usize), String> {
    let id = block.strip_prefix('^').unwrap_or(block);
    let token = format!("^{id}");
    let idx = lines
        .iter()
        .position(|l| *l == token || l.ends_with(&format!(" {token}")))
        .ok_or_else(|| format!("block not found: ^{id}"))?;
    let mut start = idx;
    while start > 0 && !lines[start - 1].trim().is_empty() {
        start -= 1;
    }
    let mut end = idx + 1;
    while end < lines.len() && !lines[end].trim().is_empty() {
        end += 1;
    }
    Ok((start, end))
}

fn handle_tools_call(id: Value, vault: &Path, params: &Value, writable: bool) -> Value {
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let is_write = matches!(name, "append" | "patch");
    let outcome = if is_write && !writable {
        Err("server is read-only; start tapa-mcp with --write to enable writes".to_string())
    } else {
        match name {
            "list" => tool_list(vault),
            "read" => tool_read(vault, args),
            "search" => tool_search(vault, args),
            "append" => tool_append(vault, args),
            "patch" => tool_patch(vault, args),
            other => Err(format!("unknown tool: {other}")),
        }
    };
    match outcome {
        Ok(text) => ok(id, tool_result(text, false)),
        Err(msg) => ok(id, tool_result(msg, true)),
    }
}

/// Pure dispatch. `Some(response)` for requests (have an `id`), `None` for
/// notifications (no `id`, e.g. `notifications/initialized`).
fn handle(req: &Value, vault: &Path, writable: bool) -> Option<Value> {
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");

    // Notifications carry no `id` and get no response.
    if method.starts_with("notifications/") {
        return None;
    }
    let id = req.get("id").cloned().unwrap_or(Value::Null);

    match method {
        "initialize" => {
            let protocol = req
                .get("params")
                .and_then(|p| p.get("protocolVersion"))
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_PROTOCOL);
            Some(ok(
                id,
                json!({
                    "protocolVersion": protocol,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "tapa", "version": env!("CARGO_PKG_VERSION") }
                }),
            ))
        }
        "ping" => Some(ok(id, json!({}))),
        "tools/list" => Some(ok(id, json!({ "tools": tools_schema(writable) }))),
        "tools/call" => {
            let empty = json!({});
            let params = req.get("params").unwrap_or(&empty);
            Some(handle_tools_call(id, vault, params, writable))
        }
        _ => Some(err(id, -32601, "Method not found")),
    }
}

fn main() {
    // First non-flag arg is the vault; `--write` anywhere enables writes.
    let mut writable = false;
    let mut vault_arg: Option<String> = None;
    for arg in std::env::args().skip(1) {
        if arg == "--write" {
            writable = true;
        } else if vault_arg.is_none() {
            vault_arg = Some(arg);
        }
    }
    let vault = match vault_arg {
        Some(v) => std::path::PathBuf::from(v),
        None => {
            eprintln!("usage: tapa-mcp <vault-root> [--write]");
            std::process::exit(1);
        }
    };
    if !vault.is_dir() {
        eprintln!("error: '{}' is not a directory", vault.display());
        std::process::exit(1);
    }

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(req) => handle(&req, &vault, writable),
            Err(_) => Some(err(Value::Null, -32700, "Parse error")),
        };
        if let Some(resp) = response {
            let _ = writeln!(out, "{resp}");
            let _ = out.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_vault() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("note.md"), "hello world\nsecond line").unwrap();
        fs::write(dir.path().join("other.md"), "nothing special here").unwrap();
        dir
    }

    #[test]
    fn initialize_returns_serverinfo() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} });
        let resp = handle(&req, dir.path(), false).unwrap();
        let result = &resp["result"];
        assert_eq!(result["protocolVersion"], DEFAULT_PROTOCOL);
        assert_eq!(result["serverInfo"]["name"], "tapa");
    }

    #[test]
    fn initialize_echoes_client_protocol() {
        let dir = temp_vault();
        let req = json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2025-03-26" }
        });
        let resp = handle(&req, dir.path(), false).unwrap();
        assert_eq!(resp["result"]["protocolVersion"], "2025-03-26");
    }

    #[test]
    fn notification_returns_none() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(handle(&req, dir.path(), false).is_none());
    }

    #[test]
    fn tools_list_has_three_tools() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        let resp = handle(&req, dir.path(), false).unwrap();
        let tools = resp["result"]["tools"].as_array().unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["list", "read", "search"]);
    }

    #[test]
    fn tools_call_list_lists_md() {
        let dir = temp_vault();
        let req = json!({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": { "name": "list", "arguments": {} }
        });
        let resp = handle(&req, dir.path(), false).unwrap();
        assert_eq!(resp["result"]["isError"], false);
        let text = resp["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("note.md"));
        assert!(text.contains("other.md"));
    }

    #[test]
    fn tools_call_read_returns_content() {
        let dir = temp_vault();
        let req = json!({
            "jsonrpc": "2.0", "id": 4, "method": "tools/call",
            "params": { "name": "read", "arguments": { "path": "note.md" } }
        });
        let resp = handle(&req, dir.path(), false).unwrap();
        assert_eq!(resp["result"]["isError"], false);
        assert!(resp["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("hello world"));
    }

    #[test]
    fn tools_call_read_blocks_traversal() {
        let dir = temp_vault();
        // A secret file OUTSIDE the vault, reached via `../`.
        let parent = dir.path().parent().unwrap();
        let secret = parent.join("tapa_mcp_secret.md");
        fs::write(&secret, "TOP SECRET").unwrap();
        let rel = format!("../{}", secret.file_name().unwrap().to_str().unwrap());
        let req = json!({
            "jsonrpc": "2.0", "id": 5, "method": "tools/call",
            "params": { "name": "read", "arguments": { "path": rel } }
        });
        let resp = handle(&req, dir.path(), false).unwrap();
        let _ = fs::remove_file(&secret);
        assert_eq!(resp["result"]["isError"], true);
        assert!(!resp["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("TOP SECRET"));
    }

    #[test]
    fn tools_call_search_hit_and_miss() {
        let dir = temp_vault();
        let hit = json!({
            "jsonrpc": "2.0", "id": 6, "method": "tools/call",
            "params": { "name": "search", "arguments": { "query": "hello" } }
        });
        let resp = handle(&hit, dir.path(), false).unwrap();
        assert_eq!(resp["result"]["isError"], false);
        let text = resp["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("note.md:1:0:"));

        let miss = json!({
            "jsonrpc": "2.0", "id": 7, "method": "tools/call",
            "params": { "name": "search", "arguments": { "query": "zzzznotpresent" } }
        });
        let resp = handle(&miss, dir.path(), false).unwrap();
        assert_eq!(resp["result"]["content"][0]["text"], "No matches.");
    }

    #[test]
    fn unknown_method_is_error() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "id": 8, "method": "bogus/thing" });
        let resp = handle(&req, dir.path(), false).unwrap();
        assert_eq!(resp["error"]["code"], -32601);
    }

    fn call(name: &str, args: Value, writable: bool, dir: &Path) -> Value {
        let req = json!({
            "jsonrpc": "2.0", "id": 99, "method": "tools/call",
            "params": { "name": name, "arguments": args }
        });
        handle(&req, dir, writable).unwrap()
    }

    #[test]
    fn tools_list_gates_write_tools() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });

        let rw = handle(&req, dir.path(), true).unwrap();
        let names: Vec<&str> = rw["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["list", "read", "search", "append", "patch"]);

        let ro = handle(&req, dir.path(), false).unwrap();
        assert_eq!(ro["result"]["tools"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn append_creates_and_extends() {
        let dir = temp_vault();
        // New file.
        let resp = call(
            "append",
            json!({ "path": "fresh.md", "content": "first line" }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], false);
        let body = fs::read_to_string(dir.path().join("fresh.md")).unwrap();
        assert_eq!(body, "first line\n");

        // Existing file gets a blank-line separator.
        let resp = call(
            "append",
            json!({ "path": "fresh.md", "content": "second line" }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], false);
        let body = fs::read_to_string(dir.path().join("fresh.md")).unwrap();
        assert_eq!(body, "first line\n\nsecond line\n");
    }

    #[test]
    fn patch_by_heading_replaces_body() {
        let dir = temp_vault();
        let path = dir.path().join("doc.md");
        fs::write(&path, "# Title\n\nold body\n\n# Next\n\nkeep me\n").unwrap();
        let resp = call(
            "patch",
            json!({
                "path": "doc.md",
                "heading": "Title",
                "if_match": "old body",
                "content": "new body"
            }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], false);
        let body = fs::read_to_string(&path).unwrap();
        assert_eq!(body, "# Title\n\nnew body\n\n# Next\n\nkeep me\n");
    }

    #[test]
    fn patch_heading_if_match_mismatch_leaves_file() {
        let dir = temp_vault();
        let path = dir.path().join("doc.md");
        let original = "# Title\n\nold body\n";
        fs::write(&path, original).unwrap();
        let resp = call(
            "patch",
            json!({
                "path": "doc.md",
                "heading": "Title",
                "if_match": "STALE EXPECTATION",
                "content": "new body"
            }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], true);
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
    }

    #[test]
    fn patch_by_block_replaces_paragraph() {
        let dir = temp_vault();
        let path = dir.path().join("blk.md");
        fs::write(&path, "intro\n\nclaim one\nclaim two ^abc123\n\noutro\n").unwrap();
        let resp = call(
            "patch",
            json!({
                "path": "blk.md",
                "block": "^abc123",
                "if_match": "claim one\nclaim two ^abc123",
                "content": "revised ^abc123"
            }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], false);
        let body = fs::read_to_string(&path).unwrap();
        assert_eq!(body, "intro\n\nrevised ^abc123\n\noutro\n");
    }

    #[test]
    fn patch_block_if_match_mismatch_leaves_file() {
        let dir = temp_vault();
        let path = dir.path().join("blk.md");
        let original = "claim ^id1\n";
        fs::write(&path, original).unwrap();
        let resp = call(
            "patch",
            json!({
                "path": "blk.md",
                "block": "id1",
                "if_match": "wrong text",
                "content": "x ^id1"
            }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], true);
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
    }

    #[test]
    fn patch_requires_exactly_one_address() {
        let dir = temp_vault();
        fs::write(dir.path().join("doc.md"), "# H\n\nbody\n").unwrap();
        let both = call(
            "patch",
            json!({ "path": "doc.md", "heading": "H", "block": "x", "if_match": "", "content": "y" }),
            true,
            dir.path(),
        );
        assert_eq!(both["result"]["isError"], true);
        let neither = call(
            "patch",
            json!({ "path": "doc.md", "if_match": "", "content": "y" }),
            true,
            dir.path(),
        );
        assert_eq!(neither["result"]["isError"], true);
    }

    #[test]
    fn write_tool_rejected_when_read_only() {
        let dir = temp_vault();
        let resp = call(
            "append",
            json!({ "path": "fresh.md", "content": "nope" }),
            false,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], true);
        assert!(!dir.path().join("fresh.md").exists());
    }

    #[test]
    fn append_blocks_traversal() {
        let dir = temp_vault();
        let parent = dir.path().parent().unwrap();
        let evil = parent.join("tapa_mcp_evil.md");
        let _ = fs::remove_file(&evil);
        let resp = call(
            "append",
            json!({ "path": "../tapa_mcp_evil.md", "content": "pwned" }),
            true,
            dir.path(),
        );
        assert_eq!(resp["result"]["isError"], true);
        assert!(!evil.exists());
    }
}
