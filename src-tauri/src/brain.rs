use std::path::PathBuf;
use std::process::Command;

const README_SEED: &str = "# Brain\n\nA git-backed, plain-Markdown ideas vault. Git is the system of record:\nevery edit is a commit, so the history is the timeline of your thinking.\n\n## How it works\n\n- Capture fast into `inbox/` — one idea per file, no friction.\n- Later, organize each note by its primary subject (move it out of the inbox).\n- The current files are the compiled truth; the git log is the timeline of\n  how that truth was reached.\n- Plain Markdown only. No database, no lock-in. Any editor works.\n\n## Conventions\n\n- One note, one idea. Short titles. Link freely between notes.\n- Commit early, commit often — the history is the feature.\n";

/// Ensure a git-backed Markdown brain vault exists at `path` (or `$HOME/brain`).
/// Idempotent. Creates the dir + `inbox/`, seeds a README on first run, and
/// best-effort `git init`s the repo. Returns the resolved absolute path.
#[tauri::command]
pub fn ensure_brain(path: Option<String>) -> Result<String, String> {
    let root: PathBuf = match path {
        Some(p) => PathBuf::from(p),
        None => {
            let home = std::env::var_os("HOME").ok_or("HOME not set")?;
            PathBuf::from(home).join("brain")
        }
    };

    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(root.join("inbox")).map_err(|e| e.to_string())?;

    let readme = root.join("README.md");
    if !readme.exists() {
        std::fs::write(&readme, README_SEED).map_err(|e| e.to_string())?;
    }

    // Best-effort git init. Git may be absent; never fail the call for it.
    if !root.join(".git").exists() {
        let _ = Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status();
        let _ = Command::new("git")
            .args(["add", "-A"])
            .current_dir(&root)
            .status();
        let _ = Command::new("git")
            .args([
                "-c",
                "user.name=Tapa",
                "-c",
                "user.email=brain@tapa.localhost",
                "commit",
                "-q",
                "-m",
                "init brain",
            ])
            .current_dir(&root)
            .status();
    }

    Ok(std::fs::canonicalize(&root)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| root.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_brain_is_idempotent() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("tapa-brain-test-{nanos}"));

        let first = ensure_brain(Some(dir.to_string_lossy().into_owned())).unwrap();
        let root = PathBuf::from(&first);
        assert!(root.exists());
        assert!(root.join("inbox").exists());
        assert!(root.join("README.md").exists());

        // Second call: still Ok, same resolved path (idempotent).
        let second = ensure_brain(Some(dir.to_string_lossy().into_owned())).unwrap();
        assert_eq!(first, second);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
