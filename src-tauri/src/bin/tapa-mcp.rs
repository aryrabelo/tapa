//! `tapa-mcp` — a Model Context Protocol server over stdio for a Markdown vault.
//!
//! Newline-delimited JSON-RPC 2.0 on stdin/stdout, no async, no extra deps.
//! Read-only tools: `list`, `read`, `search`. Reuses `app_lib`'s pure fns.

use app_lib::fs_tree::scan_markdown;
use app_lib::search::{search_dir, Hit, SearchOpts};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::Path;

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
fn tools_schema() -> Value {
    json!([
        {
            "name": "list",
            "description": "List all Markdown files in the vault (paths relative to the vault root).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "read",
            "description": "Read a Markdown file's contents by its vault-relative path.",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        },
        {
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
        }
    ])
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

fn handle_tools_call(id: Value, vault: &Path, params: &Value) -> Value {
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    let empty = json!({});
    let args = params.get("arguments").unwrap_or(&empty);
    let outcome = match name {
        "list" => tool_list(vault),
        "read" => tool_read(vault, args),
        "search" => tool_search(vault, args),
        other => Err(format!("unknown tool: {other}")),
    };
    match outcome {
        Ok(text) => ok(id, tool_result(text, false)),
        Err(msg) => ok(id, tool_result(msg, true)),
    }
}

/// Pure dispatch. `Some(response)` for requests (have an `id`), `None` for
/// notifications (no `id`, e.g. `notifications/initialized`).
fn handle(req: &Value, vault: &Path) -> Option<Value> {
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
        "tools/list" => Some(ok(id, json!({ "tools": tools_schema() }))),
        "tools/call" => {
            let empty = json!({});
            let params = req.get("params").unwrap_or(&empty);
            Some(handle_tools_call(id, vault, params))
        }
        _ => Some(err(id, -32601, "Method not found")),
    }
}

fn main() {
    let vault = match std::env::args().nth(1) {
        Some(v) => std::path::PathBuf::from(v),
        None => {
            eprintln!("usage: tapa-mcp <vault-root>");
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
            Ok(req) => handle(&req, &vault),
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
        let resp = handle(&req, dir.path()).unwrap();
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
        let resp = handle(&req, dir.path()).unwrap();
        assert_eq!(resp["result"]["protocolVersion"], "2025-03-26");
    }

    #[test]
    fn notification_returns_none() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(handle(&req, dir.path()).is_none());
    }

    #[test]
    fn tools_list_has_three_tools() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        let resp = handle(&req, dir.path()).unwrap();
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
        let resp = handle(&req, dir.path()).unwrap();
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
        let resp = handle(&req, dir.path()).unwrap();
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
        let resp = handle(&req, dir.path()).unwrap();
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
        let resp = handle(&hit, dir.path()).unwrap();
        assert_eq!(resp["result"]["isError"], false);
        let text = resp["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("note.md:1:0:"));

        let miss = json!({
            "jsonrpc": "2.0", "id": 7, "method": "tools/call",
            "params": { "name": "search", "arguments": { "query": "zzzznotpresent" } }
        });
        let resp = handle(&miss, dir.path()).unwrap();
        assert_eq!(resp["result"]["content"][0]["text"], "No matches.");
    }

    #[test]
    fn unknown_method_is_error() {
        let dir = temp_vault();
        let req = json!({ "jsonrpc": "2.0", "id": 8, "method": "bogus/thing" });
        let resp = handle(&req, dir.path()).unwrap();
        assert_eq!(resp["error"]["code"], -32601);
    }
}
