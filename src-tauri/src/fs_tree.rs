use std::path::Path;
use walkdir::{DirEntry, WalkDir};

pub(crate) fn is_hidden(e: &DirEntry) -> bool {
    e.file_name()
        .to_str()
        .map(|s| s.starts_with('.'))
        .unwrap_or(false)
}

/// True for `.md` / `.markdown` files. Shared by the tree scan and search walk.
pub(crate) fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|s| s.to_str()),
        Some("md") | Some("markdown")
    )
}

/// Returns markdown file paths relative to `root`, using forward slashes, sorted.
pub fn scan_markdown(root: &Path) -> Vec<String> {
    let mut out: Vec<String> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !is_hidden(e))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| is_markdown(e.path()))
        .filter_map(|e| e.path().strip_prefix(root).ok().map(|p| p.to_path_buf()))
        .map(|p| {
            p.components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/")
        })
        .collect();
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn finds_only_markdown_relative_sorted() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("docs")).unwrap();
        fs::write(root.join("b.md"), "b").unwrap();
        fs::write(root.join("a.markdown"), "a").unwrap();
        fs::write(root.join("ignore.txt"), "x").unwrap();
        fs::write(root.join("docs/c.md"), "c").unwrap();

        let got = scan_markdown(root);
        assert_eq!(got, vec!["a.markdown", "b.md", "docs/c.md"]);
    }

    #[test]
    fn skips_hidden_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("docs")).unwrap();
        fs::create_dir(root.join(".obsidian")).unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join("docs/c.md"), "c").unwrap();
        fs::write(root.join(".obsidian/note.md"), "n").unwrap();
        fs::write(root.join(".git/x.md"), "x").unwrap();

        let got = scan_markdown(root);
        assert_eq!(got, vec!["docs/c.md"]);
    }
}
