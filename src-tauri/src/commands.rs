use std::path::PathBuf;

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
    Ok(crate::fs_tree::scan_markdown(std::path::Path::new(&root)))
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

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(PathBuf::from(&path), content).map_err(|e| e.to_string())
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
}
