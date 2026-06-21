mod brain;
mod commands;
mod default_handler;
pub mod fs_tree;
pub mod search;
mod teleprompter;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Native menu: start from Tauri's default (keeps the macOS app/Quit
            // and Edit copy/paste menus), then add "New File" (CmdOrCtrl+N) to
            // the File submenu. The click is handled in `.on_menu_event` below.
            let handle = app.handle();
            let menu = tauri::menu::Menu::default(handle)?;
            let new_file = tauri::menu::MenuItemBuilder::with_id("new-file", "New File")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?;
            let mut placed = false;
            for kind in menu.items()? {
                if let Some(sub) = kind.as_submenu() {
                    if sub.text().map(|t| t == "File").unwrap_or(false) {
                        sub.prepend(&new_file)?;
                        placed = true;
                        break;
                    }
                }
            }
            // No File submenu (non-macOS default): add our own at the front.
            if !placed {
                let file = tauri::menu::SubmenuBuilder::new(handle, "File")
                    .item(&new_file)
                    .build()?;
                menu.insert(&file, 0)?;
            }
            handle.set_menu(menu)?;

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
            commands::is_default_markdown_handler,
            commands::set_default_markdown_handler,
            watcher::watch_folder,
            teleprompter::setup_overlay,
            brain::ensure_brain
        ])
        .on_menu_event(|app, event| {
            if event.id() == "new-file" {
                use tauri::Emitter;
                let _ = app.emit("menu:new-file", ());
            }
        })
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
