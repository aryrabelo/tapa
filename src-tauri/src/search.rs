use crate::fs_tree::{is_hidden, is_markdown};
use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

/// Max snippet length (bytes) returned per hit; keeps payloads small.
pub const SNIPPET_MAX: usize = 200;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Hit {
    pub path: String,    // relative path, forward slashes
    pub line: usize,     // 1-based line number
    pub col: usize,      // 0-based byte offset of the match start within the line
    pub snippet: String, // the matched line, truncated to <= SNIPPET_MAX bytes
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SearchOpts {
    pub regex: bool,
}

/// Smart-case: case-insensitive unless the query contains an uppercase char.
pub fn smart_case_insensitive(query: &str) -> bool {
    !query.chars().any(|c| c.is_uppercase())
}

pub enum Matcher {
    /// Case-sensitive literal — fastest path.
    LiteralCs(memchr::memmem::Finder<'static>),
    /// Case-insensitive literal OR regex mode. Boxed: a Regex is far larger than
    /// a Finder, and an unboxed variant trips clippy::large_enum_variant.
    Re(Box<regex::Regex>),
}

impl Matcher {
    pub fn build(query: &str, opts: &SearchOpts) -> Result<Matcher, String> {
        let ci = smart_case_insensitive(query);
        if opts.regex {
            regex::RegexBuilder::new(query)
                .case_insensitive(ci)
                .build()
                .map(|re| Matcher::Re(Box::new(re)))
                .map_err(|e| e.to_string())
        } else if ci {
            regex::RegexBuilder::new(&regex::escape(query))
                .case_insensitive(true)
                .build()
                .map(|re| Matcher::Re(Box::new(re)))
                .map_err(|e| e.to_string())
        } else {
            Ok(Matcher::LiteralCs(
                memchr::memmem::Finder::new(query.as_bytes()).into_owned(),
            ))
        }
    }

    /// Byte offset of the first match in `line`, or None.
    fn find(&self, line: &str) -> Option<usize> {
        match self {
            Matcher::LiteralCs(f) => f.find(line.as_bytes()),
            Matcher::Re(re) => re.find(line).map(|m| m.start()),
        }
    }
}

/// A snippet window of at most SNIPPET_MAX bytes around the match at byte `col`,
/// on char boundaries (UTF-8 safe). Starts a little before the match so it stays
/// visible even on very long lines (spec: "trimmed around the match"). Short
/// lines are returned whole.
fn snippet_around(line: &str, col: usize) -> String {
    if line.len() <= SNIPPET_MAX {
        return line.to_string();
    }
    const LEAD: usize = 24; // context bytes kept before the match
    let mut start = col.saturating_sub(LEAD);
    while start > 0 && !line.is_char_boundary(start) {
        start -= 1;
    }
    let mut end = (start + SNIPPET_MAX).min(line.len());
    while end < line.len() && !line.is_char_boundary(end) {
        end -= 1;
    }
    line[start..end].to_string()
}

/// Scan one file's text. `sink` returns false to stop early (cancellation).
pub fn search_in_text(
    path: &str,
    text: &str,
    matcher: &Matcher,
    sink: &mut dyn FnMut(Hit) -> bool,
) {
    for (i, line) in text.lines().enumerate() {
        if let Some(col) = matcher.find(line) {
            if !sink(Hit {
                path: path.to_string(),
                line: i + 1,
                col,
                snippet: snippet_around(line, col),
            }) {
                return;
            }
        }
    }
}

/// 5 MB per-file guard, mirrors commands::read_file.
pub const MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Walk `root` for markdown files and stream hits to `sink`.
/// `sink` returns false to stop early (cancellation). Empty query = no hits.
pub fn search_dir(
    root: &Path,
    query: &str,
    opts: &SearchOpts,
    sink: &mut dyn FnMut(Hit) -> bool,
) -> Result<(), String> {
    if query.is_empty() {
        return Ok(());
    }
    let matcher = Matcher::build(query, opts)?;
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !is_hidden(e))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| is_markdown(e.path()))
    {
        if entry
            .metadata()
            .map(|m| m.len() > MAX_BYTES)
            .unwrap_or(true)
        {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(entry.path()) else {
            continue; // non-UTF-8 / unreadable: skip, do not abort
        };
        let rel = entry
            .path()
            .strip_prefix(root)
            .ok()
            .map(|p| {
                p.components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/")
            })
            .unwrap_or_default();
        let mut stop = false;
        search_in_text(&rel, &text, &matcher, &mut |hit| {
            let cont = sink(hit);
            stop = !cont;
            cont
        });
        if stop {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect(text: &str, query: &str, regex: bool) -> Vec<Hit> {
        let m = Matcher::build(query, &SearchOpts { regex }).unwrap();
        let mut out = Vec::new();
        search_in_text("a.md", text, &m, &mut |h| {
            out.push(h);
            true
        });
        out
    }

    #[test]
    fn literal_smart_case_is_insensitive_when_query_lowercase() {
        let hits = collect("Hello World\nno match here\nhello again", "hello", false);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].line, 1);
        assert_eq!(hits[0].col, 0);
        assert_eq!(hits[1].line, 3);
    }

    #[test]
    fn literal_smart_case_is_sensitive_when_query_has_uppercase() {
        let hits = collect("hello\nHello", "Hello", false);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 2);
    }

    #[test]
    fn regex_mode_matches_pattern() {
        let hits = collect("a1\nbb\nc3", r"\d", true);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].line, 1);
        assert_eq!(hits[1].line, 3);
    }

    #[test]
    fn snippet_is_truncated_to_max() {
        let long = "x".repeat(SNIPPET_MAX + 50);
        let hits = collect(&long, "x", false);
        assert_eq!(hits[0].snippet.len(), SNIPPET_MAX);
    }

    #[test]
    fn snippet_windows_around_a_late_match() {
        // Match starts well past SNIPPET_MAX: the window must still contain it.
        let line = format!("{}needle tail", "y".repeat(400));
        let hits = collect(&line, "needle", false);
        assert_eq!(hits.len(), 1);
        assert!(
            hits[0].snippet.contains("needle"),
            "snippet must include the match"
        );
        assert!(hits[0].snippet.len() <= SNIPPET_MAX);
    }

    #[test]
    fn col_is_byte_offset_with_multibyte_prefix() {
        // "café " is 6 bytes (é = 2), so "needle" starts at byte 6 (char 5).
        let hits = collect("café needle", "needle", false);
        assert_eq!(hits[0].col, 6);
    }

    #[test]
    fn snippet_truncation_is_char_safe_on_multibyte() {
        // 150 × 'é' (2 bytes each) = 300 bytes after the match; the window end
        // lands mid-char and must back off to a boundary without panicking.
        let line = format!("needle {}", "é".repeat(150));
        let hits = collect(&line, "needle", false);
        assert!(hits[0].snippet.len() <= SNIPPET_MAX);
        assert!(hits[0].snippet.contains("needle"));
    }

    #[test]
    fn sink_returning_false_stops_iteration() {
        let mut out = Vec::new();
        let m = Matcher::build("a", &SearchOpts::default()).unwrap();
        search_in_text("f.md", "a\na\na", &m, &mut |h| {
            out.push(h);
            false // stop after first
        });
        assert_eq!(out.len(), 1);
    }

    use std::fs;

    #[test]
    fn search_dir_finds_hits_relative_and_skips_hidden_and_oversize() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("docs")).unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join("a.md"), "needle here\n").unwrap();
        fs::write(root.join("docs/b.md"), "no\nneedle deep\n").unwrap();
        fs::write(root.join(".git/c.md"), "needle hidden\n").unwrap();
        fs::write(root.join("ignore.txt"), "needle wrong ext\n").unwrap();
        fs::write(root.join("big.md"), vec![b'n'; (MAX_BYTES + 1) as usize]).unwrap();

        let mut hits = Vec::new();
        search_dir(root, "needle", &SearchOpts::default(), &mut |h| {
            hits.push(h);
            true
        })
        .unwrap();

        let paths: Vec<_> = hits.iter().map(|h| h.path.as_str()).collect();
        assert!(paths.contains(&"a.md"));
        assert!(paths.contains(&"docs/b.md"));
        assert!(!paths.iter().any(|p| p.contains(".git"))); // hidden skipped
        assert!(!paths.contains(&"ignore.txt")); // non-markdown skipped
        assert!(!paths.contains(&"big.md")); // oversize skipped
        assert_eq!(hits.iter().find(|h| h.path == "docs/b.md").unwrap().line, 2);
    }

    #[test]
    fn search_dir_empty_query_yields_nothing() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "anything").unwrap();
        let mut hits = Vec::new();
        search_dir(dir.path(), "", &SearchOpts::default(), &mut |h| {
            hits.push(h);
            true
        })
        .unwrap();
        assert!(hits.is_empty());
    }
}
