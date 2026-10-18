use std::path::{Path, PathBuf};

use crate::search::{search_dir, Hit, SearchOpts};
use tauri::ipc::Channel;

const MAX_BYTES: u64 = 5 * 1024 * 1024; // 5 MB guard

/// Buffer of file paths the OS asked us to open (file-association launch /
/// `open file.md`). Drained by the frontend on mount via `take_pending_open`.
#[derive(Default)]
pub struct PendingOpen(pub parking_lot::Mutex<Vec<String>>);

#[tauri::command]
pub fn take_pending_open(state: tauri::State<PendingOpen>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock())
}

#[tauri::command]
pub fn scan_tree(root: String) -> Result<Vec<String>, String> {
    Ok(crate::fs_tree::scan_tree_entries(std::path::Path::new(
        &root,
    )))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "File too large ({} bytes); over 5 MB guard",
            meta.len()
        ));
    }
    std::fs::read_to_string(&p).map_err(|_| "Not a UTF-8 text file".to_string())
}

/// Save a note crash-safely: a failed or interrupted save leaves the old bytes.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    crate::atomic_write::write_atomic(Path::new(&path), content.as_bytes())
        .map_err(|e| e.to_string())
}

/// Create a new file or directory at `path` (absolute), making parent dirs as
/// needed. Files are seeded empty and refuse to clobber an existing entry;
/// directories use `create_dir_all` (idempotent). Used by the sidebar "+".
#[tauri::command]
pub fn create_path(path: String, dir: bool) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if dir {
        return std::fs::create_dir_all(&p).map_err(|e| e.to_string());
    }
    if p.exists() {
        return Err(format!("{path} already exists"));
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, "").map_err(|e| e.to_string())
}

/// Stream content-search hits to the frontend over a Channel. Returns
/// immediately; the walk runs on a background thread and stops when the
/// Channel is closed (frontend cancellation / superseded query).
#[tauri::command]
pub fn search_content(
    root: String,
    query: String,
    regex: bool,
    on_hit: Channel<Hit>,
) -> Result<(), String> {
    let opts = SearchOpts { regex };
    std::thread::spawn(move || {
        let _ = search_dir(std::path::Path::new(&root), &query, &opts, &mut |hit| {
            on_hit.send(hit).is_ok() // false once the channel is closed -> stop
        });
    });
    Ok(())
}

/// Is Tapa the default editor for the standard Markdown UTI
/// (`net.daringfireball.markdown`)? macOS-only; `false` elsewhere.
#[tauri::command]
pub fn is_default_markdown_handler() -> bool {
    crate::default_handler::is_default()
}

/// Register Tapa as the default editor for `net.daringfireball.markdown`.
/// macOS-only; returns `Err` on other platforms.
#[tauri::command]
pub fn set_default_markdown_handler() -> Result<(), String> {
    crate::default_handler::set_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn read_write_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("note.md");
        let path = f.to_string_lossy().to_string();
        write_file(path.clone(), "# hi\n".into()).unwrap();
        assert_eq!(read_file(path).unwrap(), "# hi\n");
    }

    #[test]
    fn write_file_replaces_note_with_exact_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("note.md");
        fs::write(&f, "antes, e mais um tanto").unwrap();
        let path = f.to_string_lossy().to_string();
        write_file(path, "depois".into()).unwrap();

        // Shorter content must not leave a tail of the old bytes behind.
        assert_eq!(fs::read(&f).unwrap(), b"depois");
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, ["note.md"]);
    }

    /// An in-place write (`std::fs::write`) truncates the same inode; only a
    /// rename swaps in a new one. Fails if `write_file` stops being atomic.
    #[cfg(unix)]
    #[test]
    fn write_file_swaps_inode_instead_of_truncating() {
        use std::os::unix::fs::MetadataExt;
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("note.md");
        fs::write(&f, "antes").unwrap();
        let before = fs::metadata(&f).unwrap().ino();
        write_file(f.to_string_lossy().to_string(), "depois".into()).unwrap();
        assert_ne!(fs::metadata(&f).unwrap().ino(), before);
    }

    #[test]
    fn read_rejects_oversize() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("big.md");
        fs::write(&f, vec![b'a'; (MAX_BYTES + 1) as usize]).unwrap();
        assert!(read_file(f.to_string_lossy().to_string()).is_err());
    }

    #[test]
    fn read_rejects_non_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("bin.md");
        fs::write(&f, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_file(f.to_string_lossy().to_string()).is_err());
    }

    #[test]
    fn create_path_makes_nested_file_and_refuses_clobber() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("sub/idea.md");
        let path = f.to_string_lossy().to_string();
        create_path(path.clone(), false).unwrap();
        assert!(f.exists());
        assert_eq!(read_file(path.clone()).unwrap(), "");
        // Second create on the same file path is an error (no clobber).
        assert!(create_path(path, false).is_err());
    }

    #[test]
    fn create_path_makes_dir_idempotently() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path().join("topics/rust");
        let path = d.to_string_lossy().to_string();
        create_path(path.clone(), true).unwrap();
        assert!(d.is_dir());
        // create_dir_all is idempotent: a repeat is still Ok.
        assert!(create_path(path, true).is_ok());
    }
}

/// Mint a short-lived AssemblyAI streaming token from Rust, bypassing the
/// browser CORS that blocks the v3 token endpoint inside a WKWebView. The
/// streaming WebSocket the frontend opens with this token is CORS-exempt.
/// Wired to the overlay via `window.__BUGTOPROMPT__.mintStreamingToken`.
#[tauri::command]
pub async fn mint_assemblyai_token() -> Result<String, String> {
    #[cfg(feature = "dev-capture")]
    {
        mint_assemblyai_token_inner().await
    }
    #[cfg(not(feature = "dev-capture"))]
    {
        Err("Bug capture is not in this build. Rebuild with --features dev-capture.".to_string())
    }
}

#[cfg(feature = "dev-capture")]
async fn mint_assemblyai_token_inner() -> Result<String, String> {
    // Key is read from the host environment (loaded from `.env` at startup), so
    // it never ships in the webview bundle. Absent key => voice stays disabled.
    let api_key = std::env::var("ASSEMBLYAI_API_KEY")
        .map_err(|_| "ASSEMBLYAI_API_KEY not set".to_string())?;
    let resp = reqwest::Client::new()
        .get("https://streaming.assemblyai.com/v3/token?expires_in_seconds=300")
        .header("Authorization", api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("AssemblyAI token mint failed: {}", resp.status()));
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    json.get("token")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "AssemblyAI token response missing .token field".to_string())
}
