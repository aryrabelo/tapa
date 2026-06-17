mod commands;
mod fs_tree;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::{Emitter, Manager};

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
            watcher::watch_folder
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS delivers file-association / `open file.md` launches as an
            // Opened event (possibly before the webview is ready). Buffer the
            // paths so the frontend can drain them on mount, and also emit so a
            // running instance opens the file immediately.
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    let state = app_handle.state::<commands::PendingOpen>();
                    state.0.lock().extend(paths.iter().cloned());
                    let _ = app_handle.emit("open-files", paths);
                }
            }
        });
}
