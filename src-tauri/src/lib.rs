mod commands;
mod fs_tree;
mod search;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(watcher::WatchState::default())
        .manage(commands::PendingOpen::default())
        .invoke_handler(tauri::generate_handler![
            commands::scan_tree,
            commands::read_file,
            commands::write_file,
            commands::take_pending_open,
            commands::search_content,
            watcher::watch_folder
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // macOS/iOS deliver file-association / `open file.md` launches as a
            // RunEvent::Opened (possibly before the webview is ready). That
            // variant only exists on Apple targets, so gate the whole handler —
            // on Linux/Windows the enum has no such variant. Buffer the paths so
            // the frontend can drain them on mount, and emit so a running
            // instance opens the file immediately.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                use tauri::{Emitter, Manager};
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    let state = _app_handle.state::<commands::PendingOpen>();
                    state.0.lock().extend(paths.iter().cloned());
                    let _ = _app_handle.emit("open-files", paths);
                }
            }
        });
}
