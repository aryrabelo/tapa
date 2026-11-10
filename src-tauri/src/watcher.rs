use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::ffi::OsStr;
use std::path::{Component, Path};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct WatchState(pub(crate) Mutex<Option<RecommendedWatcher>>);

/// True when `path` names, or lives under, a directory literally called `.git`
/// (the component must match exactly, so `.github/` and `x.git.md` are not
/// mistaken for it). Platform-aware: `Path::components()` splits on `\` on
/// Windows and `/` elsewhere, whichever the watcher's native events use.
fn is_in_git_dir(path: &Path) -> bool {
    path.components()
        .any(|c| c == Component::Normal(OsStr::new(".git")))
}

/// Maps a notify event to the changed paths we care about (modify/create/remove),
/// with any path inside a `.git` directory dropped — git and agent activity there
/// is noise no feature here reads `file-changed` events for. `None` for events we
/// ignore outright (e.g. access) or whose paths were entirely `.git` noise. Pure —
/// unit-tested below.
pub(crate) fn changed_paths(event: &notify::Event) -> Option<Vec<String>> {
    if !matches!(
        event.kind,
        notify::EventKind::Modify(_) | notify::EventKind::Create(_) | notify::EventKind::Remove(_)
    ) {
        return None;
    }
    let paths: Vec<String> = event
        .paths
        .iter()
        .filter(|p| !is_in_git_dir(p))
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

#[tauri::command]
pub fn watch_folder(app: AppHandle, root: String) -> Result<(), String> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if let Some(paths) = changed_paths(&event) {
                let _ = handle.emit("file-changed", paths);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    let state: State<WatchState> = app.state();
    *state.0.lock() = Some(watcher); // keep alive
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind};
    use notify::{Event, EventKind};
    use std::path::PathBuf;

    fn ev(kind: EventKind, p: &str) -> Event {
        Event {
            kind,
            paths: vec![PathBuf::from(p)],
            attrs: Default::default(),
        }
    }

    #[test]
    fn maps_modify_create_remove_to_paths() {
        assert_eq!(
            changed_paths(&ev(EventKind::Modify(ModifyKind::Any), "/x/a.md")),
            Some(vec!["/x/a.md".to_string()])
        );
        assert_eq!(
            changed_paths(&ev(EventKind::Create(CreateKind::Any), "/x/b.md")),
            Some(vec!["/x/b.md".to_string()])
        );
        assert_eq!(
            changed_paths(&ev(EventKind::Remove(RemoveKind::Any), "/x/c.md")),
            Some(vec!["/x/c.md".to_string()])
        );
    }

    #[test]
    fn ignores_access_events() {
        assert!(changed_paths(&ev(EventKind::Access(AccessKind::Any), "/x/a.md")).is_none());
    }

    fn ev_multi(kind: EventKind, paths: &[&str]) -> Event {
        Event {
            kind,
            paths: paths.iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        }
    }

    #[test]
    fn drops_paths_inside_a_git_directory() {
        assert!(changed_paths(&ev(EventKind::Modify(ModifyKind::Any), "/x/.git/index")).is_none());
        assert!(
            changed_paths(&ev(EventKind::Modify(ModifyKind::Any), "/x/.git/logs/HEAD")).is_none()
        );
        assert!(
            changed_paths(&ev(EventKind::Modify(ModifyKind::Any), "/x/sub/.git/HEAD")).is_none()
        );
    }

    #[test]
    fn keeps_paths_that_only_look_like_git() {
        assert_eq!(
            changed_paths(&ev(EventKind::Modify(ModifyKind::Any), "/x/a.md")),
            Some(vec!["/x/a.md".to_string()])
        );
        assert_eq!(
            changed_paths(&ev(
                EventKind::Modify(ModifyKind::Any),
                "/x/.tapa/control.json"
            )),
            Some(vec!["/x/.tapa/control.json".to_string()])
        );
        assert_eq!(
            changed_paths(&ev(
                EventKind::Modify(ModifyKind::Any),
                "/x/notes/.github/x.md"
            )),
            Some(vec!["/x/notes/.github/x.md".to_string()])
        );
        assert_eq!(
            changed_paths(&ev(EventKind::Modify(ModifyKind::Any), "/x/x.git.md")),
            Some(vec!["/x/x.git.md".to_string()])
        );
    }

    #[test]
    fn mixed_event_keeps_only_the_non_git_paths() {
        assert_eq!(
            changed_paths(&ev_multi(
                EventKind::Modify(ModifyKind::Any),
                &["/x/.git/index", "/x/a.md", "/x/sub/.git/HEAD", "/x/b.md"]
            )),
            Some(vec!["/x/a.md".to_string(), "/x/b.md".to_string()])
        );
    }
}
