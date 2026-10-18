//! Crash-safe replacement of a note on disk.
//!
//! The new bytes go to a hidden temp file beside the note, are synced, and then
//! renamed over the note. A rename within one directory is atomic, so a crash
//! leaves either the old note or the new one, never an empty or half-written file.

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Atomically replace (or create) `path` with `content`.
///
/// Not carried over to the replacement: owner/group, extended attributes
/// (Finder tags, quarantine), ACLs and creation date. Other hard links to the
/// note keep the old bytes, because the rename swaps in a new inode.
pub(crate) fn write_atomic(path: &Path, content: &[u8]) -> io::Result<()> {
    write_atomic_with(path, |f| f.write_all(content))
}

/// `fill` writes the body into the temp file. It is a parameter so tests can
/// fail partway through a real write.
fn write_atomic_with(
    path: &Path,
    fill: impl FnOnce(&mut File) -> io::Result<()>,
) -> io::Result<()> {
    let target = resolve_target(path)?;
    let perms = match fs::metadata(&target) {
        // `std::fs::write` used to fail on a read-only note. A rename would
        // replace it anyway (only the directory needs to be writable), so refuse.
        Ok(meta) if meta.permissions().readonly() => {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "file is read-only",
            ))
        }
        Ok(meta) => Some(meta.permissions()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e),
    };
    let dir = parent_dir(&target);
    let tmp = dir.join(temp_name());

    // create_new: never reuse or clobber an existing entry. A new note gets the
    // default mode (0666 minus umask), same as `std::fs::write` gave it.
    let mut file = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    // `File` has no user-space buffer, so sync_all is the flush that matters.
    let staged = fill(&mut file)
        .and_then(|()| perms.map_or(Ok(()), |p| file.set_permissions(p)))
        .and_then(|()| file.sync_all());
    drop(file);
    if let Err(e) = staged.and_then(|()| fs::rename(&tmp, &target)) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    sync_dir(dir);
    Ok(())
}

/// A symlinked note is written through: the link stays a link and the file it
/// points at gets the new bytes, as `std::fs::write` did. Renaming over the
/// link would turn it into a regular file and detach the note from where it
/// really lives. A dangling link is refused (canonicalize fails), not guessed at.
fn resolve_target(path: &Path) -> io::Result<PathBuf> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => fs::canonicalize(path),
        _ => Ok(path.to_path_buf()),
    }
}

fn parent_dir(target: &Path) -> &Path {
    match target.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    }
}

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Dot-prefixed so the tree scan (`fs_tree::is_hidden`) never lists it. pid
/// separates processes; the counter separates saves within this process even
/// when the clock repeats. The note's own name is left out so a long file name
/// cannot push the temp name past the filesystem's name limit.
fn temp_name() -> OsString {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    format!(".tapa-tmp.{}.{nanos}.{seq}", std::process::id()).into()
}

/// Make the rename itself durable. Best effort: the new bytes are already in
/// place, so a failure here must not report the save as failed. If it fails,
/// the rename survives a crash only once the filesystem flushes its metadata.
#[cfg(unix)]
fn sync_dir(dir: &Path) {
    if let Ok(d) = File::open(dir) {
        let _ = d.sync_all();
    }
}

/// Windows cannot open a directory as a `File` to sync it.
#[cfg(not(unix))]
fn sync_dir(_dir: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn write_file_interrupted_mid_write_keeps_original() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        fs::write(&note, "antes").unwrap();

        let res = write_atomic_with(&note, |f| {
            f.write_all(b"dep")?;
            // Mid-write: the bytes went to a hidden sibling, the note is untouched.
            let names = entries(dir.path());
            assert_eq!(names.len(), 2, "{names:?}");
            assert!(names[0].starts_with(".tapa-tmp."), "{names:?}");
            assert_eq!(fs::read_to_string(&note).unwrap(), "antes");
            Err(io::Error::other("simulated crash"))
        });

        assert_eq!(res.unwrap_err().to_string(), "simulated crash");
        assert_eq!(fs::read_to_string(&note).unwrap(), "antes");
        assert_eq!(entries(dir.path()), ["note.md"]);
    }

    #[test]
    fn write_file_interrupted_new_note_leaves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("new.md");
        let res = write_atomic_with(&note, |f| {
            f.write_all(b"half")?;
            Err(io::Error::other("simulated crash"))
        });
        assert!(res.is_err());
        assert!(entries(dir.path()).is_empty());
    }

    #[test]
    fn write_file_refuses_read_only_note() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("locked.md");
        fs::write(&note, "antes").unwrap();
        let mut perms = fs::metadata(&note).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&note, perms).unwrap();

        let err = write_atomic(&note, b"depois").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(fs::read_to_string(&note).unwrap(), "antes");
        assert_eq!(entries(dir.path()), ["locked.md"]);
    }

    #[cfg(unix)]
    #[test]
    fn write_file_keeps_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("private.md");
        fs::write(&note, "antes").unwrap();
        // 0604 is not 0666 minus any usual umask, so a temp file that kept
        // its default mode cannot pass by accident.
        fs::set_permissions(&note, fs::Permissions::from_mode(0o604)).unwrap();

        write_atomic(&note, b"depois").unwrap();
        let mode = fs::metadata(&note).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o604);
    }

    #[cfg(unix)]
    #[test]
    fn write_file_writes_through_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.md");
        let link = dir.path().join("link.md");
        fs::write(&real, "antes").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        write_atomic(&link, b"depois").unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(&real).unwrap(), "depois");
        assert_eq!(entries(dir.path()), ["link.md", "real.md"]);
    }

    #[cfg(unix)]
    #[test]
    fn write_file_refuses_dangling_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("link.md");
        std::os::unix::fs::symlink(dir.path().join("gone.md"), &link).unwrap();

        assert!(write_atomic(&link, b"depois").is_err());
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(entries(dir.path()), ["link.md"]);
    }
}
