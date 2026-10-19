//! File actions behind the File menu: rename, move to trash, show in the OS
//! file manager, and a cheap "what is at this path" probe for drag-drop and
//! Open Recent. Errors are short plain-English strings the UI can show as-is.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// `"file"`, `"dir"` or `"missing"` (symlinks are followed).
#[tauri::command]
pub fn path_kind(path: String) -> &'static str {
    kind(Path::new(&path))
}

/// Rename/move `from` to `to`. Refuses to replace an existing item and creates
/// nothing else (no parent folders).
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    rename(Path::new(&from), Path::new(&to))
}

/// Move `path` to the OS trash (Trash / Recycle Bin). Never deletes for good.
#[tauri::command]
pub fn trash_path(path: String) -> Result<(), String> {
    move_to_trash(Path::new(&path)).map(|_| ())
}

/// Select `path` in Finder/Explorer. Linux has no portable "select", so it
/// opens the parent folder.
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if fs::symlink_metadata(path).is_err() {
        return Err(gone(path));
    }
    reveal(path)
}

fn kind(path: &Path) -> &'static str {
    match fs::metadata(path) {
        Ok(m) if m.is_dir() => "dir",
        Ok(_) => "file",
        Err(_) => "missing",
    }
}

fn name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn gone(path: &Path) -> String {
    format!("\"{}\" no longer exists.", name(path))
}

fn rename(from: &Path, to: &Path) -> Result<(), String> {
    if fs::symlink_metadata(from).is_err() {
        return Err(gone(from));
    }
    if from == to {
        return Ok(());
    }
    let failed = |e: io::Error| format!("Could not rename \"{}\": {e}", name(from));
    match rename_no_replace(from, to) {
        Ok(()) => Ok(()),
        // On case-insensitive disks `to` already "exists" when only the letter
        // case changes. If it is `from`'s own entry, a plain rename is safe.
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists && is_alias(from, to) => {
            fs::rename(from, to).map_err(failed)
        }
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
            Err(format!("There is already an item named \"{}\".", name(to)))
        }
        Err(e) => Err(failed(e)),
    }
}

/// Rename that fails with `AlreadyExists` instead of replacing `to`, decided by
/// the OS in one step so nothing created meanwhile can be overwritten.
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    let (f, t) = (c_path(from)?, c_path(to)?);
    // SAFETY: both are valid NUL-terminated strings that outlive the call.
    if unsafe { libc::renamex_np(f.as_ptr(), t.as_ptr(), libc::RENAME_EXCL) } == 0 {
        return Ok(());
    }
    let err = io::Error::last_os_error();
    match err.raw_os_error() {
        // The disk (some network/FAT volumes) has no exclusive rename.
        Some(libc::ENOTSUP) => checked_rename(from, to),
        _ => Err(err),
    }
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    let (f, t) = (c_path(from)?, c_path(to)?);
    // Raw syscall: the glibc wrapper is newer than some supported distros.
    // SAFETY: both are valid NUL-terminated strings that outlive the call.
    let done = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            f.as_ptr(),
            libc::AT_FDCWD,
            t.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if done == 0 {
        return Ok(());
    }
    let err = io::Error::last_os_error();
    match err.raw_os_error() {
        // Kernel older than 3.15, or a filesystem without RENAME_NOREPLACE.
        Some(libc::ENOSYS | libc::EINVAL) => checked_rename(from, to),
        _ => Err(err),
    }
}

/// `std::fs::rename` passes MOVEFILE_REPLACE_EXISTING; without it Windows
/// refuses an existing target but still allows a case-only rename.
#[cfg(windows)]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }
    let wide = |p: &Path| -> Vec<u16> { p.as_os_str().encode_wide().chain([0]).collect() };
    let (f, t) = (wide(from), wide(to));
    // SAFETY: both are valid NUL-terminated UTF-16 strings that outlive the call.
    if unsafe { MoveFileExW(f.as_ptr(), t.as_ptr(), 0) } != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(
    target_os = "macos",
    target_os = "ios",
    target_os = "linux",
    target_os = "android",
    windows
)))]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    checked_rename(from, to)
}

/// Fallback when the OS has no atomic no-replace rename: check, then rename.
/// Something created at `to` between the two steps would be replaced.
#[cfg(not(windows))]
fn checked_rename(from: &Path, to: &Path) -> io::Result<()> {
    if fs::symlink_metadata(to).is_ok() {
        return Err(io::ErrorKind::AlreadyExists.into());
    }
    fs::rename(from, to)
}

#[cfg(any(
    target_os = "macos",
    target_os = "ios",
    target_os = "linux",
    target_os = "android"
))]
fn c_path(path: &Path) -> io::Result<std::ffi::CString> {
    use std::os::unix::ffi::OsStrExt;
    std::ffi::CString::new(path.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "path contains a NUL byte"))
}

/// True when `to` is only another spelling (letter case, Unicode form) of
/// `from`'s own entry on a case-insensitive disk. A hard link, or any entry
/// stored under exactly `to`'s name, is a different item.
#[cfg(unix)]
fn is_alias(from: &Path, to: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    let same_inode = match (fs::symlink_metadata(from), fs::symlink_metadata(to)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    };
    let Some(want) = to.file_name() else {
        return false;
    };
    let dir = to
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let stored_as_named = match fs::read_dir(dir) {
        Ok(entries) => entries.flatten().any(|e| e.file_name() == want),
        Err(_) => true,
    };
    same_inode && !stored_as_named
}

/// Windows needs no alias check: MoveFileExW already renames a file to a
/// different letter case of its own name.
#[cfg(not(unix))]
fn is_alias(_from: &Path, _to: &Path) -> bool {
    false
}

/// Returns where the item landed when the OS reports it (macOS only).
fn move_to_trash(path: &Path) -> Result<Option<PathBuf>, String> {
    if fs::symlink_metadata(path).is_err() {
        return Err(gone(path));
    }
    os_trash(path).map_err(|e| format!("Could not move \"{}\" to the trash: {e}", name(path)))
}

#[cfg(target_os = "macos")]
fn os_trash(path: &Path) -> Result<Option<PathBuf>, String> {
    use objc2_foundation::{NSFileManager, NSURL};
    let url = if path.is_dir() {
        NSURL::from_directory_path(path)
    } else {
        NSURL::from_file_path(path)
    }
    .ok_or("invalid path")?;
    let mut landed = None;
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, Some(&mut landed))
        .map_err(|e| e.localizedDescription().to_string())?;
    Ok(landed.and_then(|u| u.to_file_path()))
}

#[cfg(all(
    not(target_os = "macos"),
    not(target_os = "ios"),
    not(target_os = "android")
))]
fn os_trash(path: &Path) -> Result<Option<PathBuf>, String> {
    trash::delete(path).map_err(|e| e.to_string())?;
    Ok(None)
}

#[cfg(any(target_os = "ios", target_os = "android"))]
fn os_trash(_path: &Path) -> Result<Option<PathBuf>, String> {
    Err("not supported on this device".into())
}

#[cfg(target_os = "macos")]
fn reveal(path: &Path) -> Result<(), String> {
    run(std::process::Command::new("open").arg("-R").arg(path))
}

#[cfg(windows)]
fn reveal(path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // explorer parses its own command line: `/select,"C:\a b\c.md"` must reach
    // it verbatim, which std's argument quoting would break.
    let mut cmd = std::process::Command::new("explorer");
    cmd.raw_arg(format!("/select,\"{}\"", path.display()));
    run(&mut cmd)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn reveal(path: &Path) -> Result<(), String> {
    let folder = if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(path)
    };
    open_external(folder.as_os_str())
}

/// Hand a URL or folder to the OS default handler (browser, file manager).
pub fn open_external(target: &std::ffi::OsStr) -> Result<(), String> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    };
    run(std::process::Command::new(opener).arg(target))
}

/// Start a helper without blocking the caller; a background thread reaps it.
/// Only a spawn failure counts (explorer exits non-zero even on success).
fn run(cmd: &mut std::process::Command) -> Result<(), String> {
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_kind_tells_file_dir_and_missing_apart() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "x").unwrap();
        assert_eq!(kind(&file), "file");
        assert_eq!(kind(dir.path()), "dir");
        assert_eq!(kind(&dir.path().join("nope.md")), "missing");
        assert_eq!(kind(Path::new("")), "missing");
    }

    #[test]
    fn rename_moves_the_item() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("a.md"), dir.path().join("b.md"));
        fs::write(&from, "hello").unwrap();
        rename(&from, &to).unwrap();
        assert!(!from.exists());
        assert_eq!(fs::read_to_string(&to).unwrap(), "hello");
    }

    #[test]
    fn rename_refuses_to_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("a.md"), dir.path().join("b.md"));
        fs::write(&from, "mine").unwrap();
        fs::write(&to, "theirs").unwrap();
        let err = rename(&from, &to).unwrap_err();
        assert!(err.contains("already an item named \"b.md\""), "{err}");
        assert_eq!(fs::read_to_string(&from).unwrap(), "mine");
        assert_eq!(fs::read_to_string(&to).unwrap(), "theirs");
    }

    // The OS step itself must refuse, so a file created after any check is
    // still never replaced.
    #[test]
    fn os_rename_step_never_replaces() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("a.md"), dir.path().join("b.md"));
        fs::write(&from, "mine").unwrap();
        fs::write(&to, "theirs").unwrap();
        let err = rename_no_replace(&from, &to).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(&from).unwrap(), "mine");
        assert_eq!(fs::read_to_string(&to).unwrap(), "theirs");
    }

    // Two names for one file are two items: renaming onto the other name must
    // fail loudly instead of silently leaving the old name in place.
    #[test]
    fn rename_onto_a_hard_link_of_itself_is_a_collision() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("a.md"), dir.path().join("b.md"));
        fs::write(&from, "same").unwrap();
        fs::hard_link(&from, &to).unwrap();
        let err = rename(&from, &to).unwrap_err();
        assert!(err.contains("already an item named \"b.md\""), "{err}");
        assert!(from.exists());
        assert!(to.exists());
    }

    #[test]
    fn rename_refuses_to_overwrite_a_folder() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("a"), dir.path().join("b"));
        fs::create_dir(&from).unwrap();
        fs::create_dir(&to).unwrap();
        assert!(rename(&from, &to).is_err());
        assert!(from.is_dir());
    }

    #[test]
    fn rename_missing_source_errors_and_creates_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let to = dir.path().join("b.md");
        let err = rename(&dir.path().join("a.md"), &to).unwrap_err();
        assert!(err.contains("\"a.md\" no longer exists"), "{err}");
        assert!(!to.exists());
    }

    #[test]
    fn rename_does_not_create_parent_folders() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("a.md");
        fs::write(&from, "x").unwrap();
        assert!(rename(&from, &dir.path().join("sub/b.md")).is_err());
        assert!(from.exists());
        assert!(!dir.path().join("sub").exists());
    }

    #[test]
    fn rename_can_change_only_letter_case() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("note.md"), dir.path().join("Note.md"));
        fs::write(&from, "x").unwrap();
        rename(&from, &to).unwrap();
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, ["Note.md"]);
    }

    // Disks where the OS step reports a case-only rename as a collision
    // (Linux casefold folders, fallback path) rely on this check.
    #[cfg(unix)]
    #[test]
    fn other_letter_case_is_the_same_item_but_a_hard_link_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let (note, upper, link) = (
            dir.path().join("note.md"),
            dir.path().join("Note.md"),
            dir.path().join("link.md"),
        );
        fs::write(&note, "x").unwrap();
        fs::hard_link(&note, &link).unwrap();
        assert!(!is_alias(&note, &link));
        // Only meaningful where the temp folder ignores letter case (macOS).
        if upper.exists() {
            assert!(is_alias(&note, &upper));
        }
    }

    #[test]
    fn trash_missing_path_errors() {
        let dir = tempfile::tempdir().unwrap();
        let err = move_to_trash(&dir.path().join("gone.md")).unwrap_err();
        assert!(err.contains("no longer exists"), "{err}");
    }

    // Touches the real user Trash; macOS reports where the item landed, so the
    // test removes it again and leaves the Trash as it found it.
    #[cfg(target_os = "macos")]
    #[test]
    fn trash_moves_file_out_of_its_folder() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir
            .path()
            .join(format!("tapa-trash-test-{}.md", std::process::id()));
        fs::write(&file, "bye").unwrap();
        let landed = move_to_trash(&file)
            .unwrap()
            .expect("macOS reports the trash location");
        assert!(!file.exists());
        assert_eq!(fs::read_to_string(&landed).unwrap(), "bye");
        fs::remove_file(landed).unwrap();
    }
}
