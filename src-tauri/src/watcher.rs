use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct WatchState(pub(crate) Mutex<Option<RecommendedWatcher>>);

/// Maps a notify event to the changed paths we care about (modify/create/remove),
/// or None for events we ignore (e.g. access). Pure — unit-tested below.
pub(crate) fn changed_paths(event: &notify::Event) -> Option<Vec<String>> {
    if matches!(
        event.kind,
        notify::EventKind::Modify(_) | notify::EventKind::Create(_) | notify::EventKind::Remove(_)
    ) {
        Some(
            event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
        )
    } else {
        None
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
}
