//! "What changed" support: the previous version of a note.
//!
//! Inside a Git work tree the previous version is the file at `HEAD`. Anywhere
//! else it is Tapa's own snapshot: the note's content as it was the last time it
//! was opened (`remember_version` overwrites it on every open). Saving never
//! touches the snapshot, so autosave cannot erase the baseline, and edits made
//! behind Tapa's back while a note is open show up as changes. Snapshots live in
//! one file per note under a versions directory, named by a stable hash of the
//! note's canonical path.
//!
//! Everything here takes the versions directory explicitly so tests need no
//! Tauri runtime; the commands in `commands.rs` resolve it from the app data dir.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

/// Same ceiling as `read_file`: bigger notes are neither read nor snapshotted.
pub(crate) const MAX_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VersionSource {
    Git,
    Saved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviousVersion {
    pub source: VersionSource,
    pub text: String,
}

/// FNV-1a 64-bit. Hand-rolled because the snapshot file name must stay stable
/// across releases, which `DefaultHasher` does not promise.
fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn snapshot_path(versions_dir: &Path, note: &Path) -> PathBuf {
    let key = fs::canonicalize(note).unwrap_or_else(|_| note.to_path_buf());
    let hash = fnv1a_64(key.to_string_lossy().as_bytes());
    versions_dir.join(format!("{hash:016x}"))
}

/// Read a note as UTF-8 text under the 5 MB cap.
fn read_note(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "File too large ({} bytes); over 5 MB guard",
            meta.len()
        ));
    }
    fs::read_to_string(path).map_err(|_| "Not a UTF-8 text file".to_string())
}

/// The note's content at `HEAD`, or `None` when that cannot be had: `git` is
/// missing, the folder is not a work tree, the file is untracked, there is no
/// commit yet, or the content is oversize / not UTF-8.
fn git_head_text(note: &Path) -> Option<String> {
    let note = fs::canonicalize(note).ok()?;
    let name = note.file_name()?.to_str()?;
    let dir = note.parent()?;
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .arg("show")
        .arg(format!("HEAD:./{name}"))
        .output()
        .ok()?;
    if !output.status.success() || output.stdout.len() as u64 > MAX_BYTES {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

fn read_snapshot(versions_dir: &Path, note: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(snapshot_path(versions_dir, note)) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Previous version of `path`: `HEAD` content in Git, else the stored snapshot.
pub fn previous_version(
    versions_dir: Option<&Path>,
    path: &Path,
) -> Result<Option<PreviousVersion>, String> {
    if let Some(text) = git_head_text(path) {
        return Ok(Some(PreviousVersion {
            source: VersionSource::Git,
            text,
        }));
    }
    let Some(dir) = versions_dir else {
        return Ok(None);
    };
    Ok(read_snapshot(dir, path)?.map(|text| PreviousVersion {
        source: VersionSource::Saved,
        text,
    }))
}

/// Overwrite the note's snapshot with its current on-disk content. Called each
/// time the note is opened.
pub fn remember_version(versions_dir: Option<&Path>, path: &Path) -> Result<(), String> {
    let Some(dir) = versions_dir else {
        return Ok(());
    };
    let content = read_note(path)?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    crate::atomic_write::write_atomic(&snapshot_path(dir, path), content.as_bytes())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .current_dir(dir)
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE")
            .status()
            .expect("git is installed");
        assert!(status.success(), "git {args:?} failed");
    }

    fn git_repo_with_committed(name: &str, text: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q"]);
        let note = dir.path().join(name);
        fs::write(&note, text).unwrap();
        git(dir.path(), &["add", name]);
        git(dir.path(), &["commit", "-q", "-m", "first"]);
        (dir, note)
    }

    fn saved(text: &str) -> Option<PreviousVersion> {
        Some(PreviousVersion {
            source: VersionSource::Saved,
            text: text.into(),
        })
    }

    #[test]
    fn changes_git_folder_returns_head_text() {
        let (_repo, note) = git_repo_with_committed("note.md", "committed\n");
        fs::write(&note, "edited on disk\n").unwrap();
        let versions = tempfile::tempdir().unwrap();

        let prev = previous_version(Some(versions.path()), &note).unwrap();
        assert_eq!(
            prev,
            Some(PreviousVersion {
                source: VersionSource::Git,
                text: "committed\n".into()
            })
        );
    }

    #[test]
    fn changes_git_wins_over_snapshot() {
        let (_repo, note) = git_repo_with_committed("note.md", "committed\n");
        let versions = tempfile::tempdir().unwrap();
        fs::write(&note, "opened\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();

        let prev = previous_version(Some(versions.path()), &note)
            .unwrap()
            .unwrap();
        assert_eq!(prev.source, VersionSource::Git);
        assert_eq!(prev.text, "committed\n");
    }

    #[test]
    fn changes_non_git_folder_returns_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let versions = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        fs::write(&note, "v1\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();
        fs::write(&note, "v2\n").unwrap();

        assert_eq!(
            previous_version(Some(versions.path()), &note).unwrap(),
            saved("v1\n")
        );
    }

    #[test]
    fn changes_no_snapshot_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let versions = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        fs::write(&note, "v1\n").unwrap();

        assert_eq!(
            previous_version(Some(versions.path()), &note).unwrap(),
            None
        );
        assert_eq!(previous_version(None, &note).unwrap(), None);
        // A note that does not exist has no previous version either.
        let gone = dir.path().join("gone.md");
        assert_eq!(
            previous_version(Some(versions.path()), &gone).unwrap(),
            None
        );
    }

    #[test]
    fn changes_remember_version_overwrites_so_latest_open_wins() {
        let dir = tempfile::tempdir().unwrap();
        let versions = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        fs::write(&note, "first\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();
        fs::write(&note, "second\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();

        assert_eq!(
            previous_version(Some(versions.path()), &note).unwrap(),
            saved("second\n")
        );
    }

    #[test]
    fn changes_write_file_leaves_snapshot_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let versions = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        fs::write(&note, "opened\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();
        // The same atomic write the `write_file` command performs.
        crate::atomic_write::write_atomic(&note, b"autosaved\n").unwrap();

        assert_eq!(fs::read_to_string(&note).unwrap(), "autosaved\n");
        assert_eq!(
            previous_version(Some(versions.path()), &note).unwrap(),
            saved("opened\n")
        );
    }

    #[test]
    fn changes_untracked_file_in_git_repo_falls_back_to_snapshot() {
        let (repo, _tracked) = git_repo_with_committed("tracked.md", "t\n");
        let versions = tempfile::tempdir().unwrap();
        let note = repo.path().join("untracked.md");
        fs::write(&note, "snap\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();

        assert_eq!(
            previous_version(Some(versions.path()), &note).unwrap(),
            saved("snap\n")
        );
    }

    #[test]
    fn changes_git_repo_without_commits_falls_back_to_snapshot() {
        let repo = tempfile::tempdir().unwrap();
        git(repo.path(), &["init", "-q"]);
        let versions = tempfile::tempdir().unwrap();
        let note = repo.path().join("note.md");
        fs::write(&note, "snap\n").unwrap();
        remember_version(Some(versions.path()), &note).unwrap();

        assert_eq!(
            previous_version(Some(versions.path()), &note).unwrap(),
            saved("snap\n")
        );
    }

    #[test]
    fn changes_remember_version_rejects_oversize_and_non_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let versions = tempfile::tempdir().unwrap();
        let big = dir.path().join("big.md");
        fs::write(&big, vec![b'a'; MAX_BYTES as usize + 1]).unwrap();
        assert!(remember_version(Some(versions.path()), &big).is_err());
        let bin = dir.path().join("bin.md");
        fs::write(&bin, [0xff, 0xfe, 0x00]).unwrap();
        assert!(remember_version(Some(versions.path()), &bin).is_err());
    }

    #[test]
    fn changes_snapshot_name_is_stable_fnv1a() {
        // Pinned: snapshots written by one release must be found by the next.
        assert_eq!(fnv1a_64(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a_64(b"a"), 0xaf63_dc4c_8601_ec8c);
    }
}
