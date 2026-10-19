mod atomic_write;
mod brain;
mod commands;
mod default_handler;
mod file_ops;
pub mod fs_tree;
mod menu;
pub mod search;
mod teleprompter;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // dev-capture only. ring is not a default rustls provider, so install it
    // once or building the token client panics. Err means it is already installed.
    #[cfg(feature = "dev-capture")]
    let _ = rustls::crypto::ring::default_provider().install_default();
    // Load `.env` into the process environment so the native token mint can read
    // ASSEMBLYAI_API_KEY. The key stays server-side and never reaches the webview.
    #[cfg(feature = "dev-capture")]
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Native menu bar; each custom item emits `"menu"` with its id.
            menu::install(app.handle())?;

            // Desktop-only: the updater + process plugins have no mobile support,
            // so a future `tauri android/ios` build must not register them.
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            #[cfg(target_os = "macos")]
            app.handle().plugin(tauri_nspanel::init())?;
            if cfg!(debug_assertions) {
                // Dev builds: tag the window title so a running dev instance is
                // visually distinct from the installed release.
                use tauri::Manager;
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_title("Tapa — DEV");
                }
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
            commands::create_path,
            commands::take_pending_open,
            commands::search_content,
            commands::is_default_markdown_handler,
            commands::set_default_markdown_handler,
            watcher::watch_folder,
            teleprompter::setup_overlay,
            brain::ensure_brain,
            commands::mint_assemblyai_token,
            menu::set_recent_menu,
            file_ops::rename_path,
            file_ops::trash_path,
            file_ops::reveal_path,
            file_ops::path_kind
        ])
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
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
