//! Native menu bar. Every custom item emits ONE `"menu"` event whose payload is
//! the item id: a registry command id (`file.new`, `view.zoomIn`, ...) or
//! `recent:<absolute path>`. The frontend maps it; Rust knows no behavior.
//! The accelerators here are the single source for these shortcuts.

use std::path::Path;
use tauri::menu::{
    AboutMetadata, IsMenuItem, Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu,
    SubmenuBuilder, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Emitter, Manager, Wry};

/// Handled in Rust, never emitted: closing goes through the window's normal
/// close request so the frontend's `onCloseRequested` still runs.
const CLOSE_WINDOW: &str = "native:close-window";
/// Windows/Linux only (macOS uses the predefined Enter Full Screen item).
#[cfg(not(target_os = "macos"))]
const FULLSCREEN: &str = "native:fullscreen";
/// Handled in Rust (the webview has no opener plugin); not emitted.
const WEBSITE: &str = "help.website";
const WEBSITE_URL: &str = "https://github.com/aryrabelo/tapa";

const RECENT_PREFIX: &str = "recent:";
const CLEAR_RECENT: &str = "file.clearRecent";

#[cfg(target_os = "macos")]
const REVEAL_LABEL: &str = "Show in Finder";
#[cfg(windows)]
const REVEAL_LABEL: &str = "Show in Explorer";
#[cfg(not(any(target_os = "macos", windows)))]
const REVEAL_LABEL: &str = "Show in Folder";

/// The File ▸ Open Recent submenu, rebuilt by `set_recent_menu`.
pub struct RecentMenu(Submenu<Wry>);

/// Build the menu bar, install it, and keep the Open Recent handle in state.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let item = |id: &str, text: &str, accel: Option<&str>| -> tauri::Result<MenuItem<Wry>> {
        let mut b = MenuItemBuilder::with_id(id, text);
        if let Some(accel) = accel {
            b = b.accelerator(accel);
        }
        b.build(app)
    };
    let pkg = app.package_info();
    let about = PredefinedMenuItem::about(
        app,
        Some("About Tapa"),
        Some(AboutMetadata {
            name: Some(pkg.name.clone()),
            version: Some(pkg.version.to_string()),
            copyright: app.config().bundle.copyright.clone(),
            authors: app.config().bundle.publisher.clone().map(|p| vec![p]),
            ..Default::default()
        }),
    )?;
    let check_updates = item("app.checkForUpdates", "Check for Updates…", None)?;
    let settings = item("settings.open", SETTINGS_LABEL, Some("CmdOrCtrl+,"))?;

    let recent = SubmenuBuilder::with_id(app, "file.openRecent", "Open Recent").build()?;
    fill_recent(&recent, &[])?;

    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(app, pkg.name.clone())
        .item(&about)
        .item(&check_updates)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&item("file.new", "New File", Some("CmdOrCtrl+N"))?)
        .item(&item("file.open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&item(
            "file.openFolder",
            "Open Folder…",
            Some("CmdOrCtrl+Shift+O"),
        )?)
        .item(&recent)
        .separator()
        .item(&item("file.save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item("file.saveAs", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .item(&item("file.rename", "Rename…", None)?)
        .item(&item("file.reveal", REVEAL_LABEL, None)?)
        .item(&item("file.trash", "Move to Trash", None)?)
        .separator()
        .item(&item("file.close", "Close Note", Some("CmdOrCtrl+W"))?)
        .item(&item(
            CLOSE_WINDOW,
            "Close Window",
            Some("CmdOrCtrl+Shift+W"),
        )?);
    // Windows convention: Settings and Exit live at the bottom of File.
    #[cfg(windows)]
    let file = file.separator().item(&settings).separator().quit();
    #[cfg(not(any(target_os = "macos", windows)))]
    let file = file.separator().quit();
    let file = file.build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&item("find.open", "Find…", Some("CmdOrCtrl+F"))?)
        .item(&item(
            "find.replace",
            "Find and Replace…",
            Some("CmdOrCtrl+Alt+F"),
        )?)
        .item(&item(
            "search.open",
            "Search in Files…",
            Some("CmdOrCtrl+Shift+F"),
        )?);
    // Linux convention: Edit ▸ Preferences.
    #[cfg(not(any(target_os = "macos", windows)))]
    let edit = edit.separator().item(&settings);
    let edit = edit.build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&item(
            "view.toggleSidebar",
            "Show/Hide Sidebar",
            Some("CmdOrCtrl+B"),
        )?)
        .item(&item("palette.open", "Go to File…", Some("CmdOrCtrl+K"))?)
        .separator()
        .item(&item("view.zoomIn", "Bigger Text", Some("CmdOrCtrl+="))?)
        .item(&item("view.zoomOut", "Smaller Text", Some("CmdOrCtrl+-"))?)
        .item(&item("view.zoomReset", "Actual Size", Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&item(
            "focus.toggle",
            "Focus Mode",
            Some("CmdOrCtrl+Shift+D"),
        )?)
        .separator();
    #[cfg(target_os = "macos")]
    let view = view.fullscreen();
    #[cfg(not(target_os = "macos"))]
    let view = view.item(&item(FULLSCREEN, "Full Screen", Some("F11"))?);
    let view = view.build()?;

    let window = SubmenuBuilder::with_id(app, WINDOW_SUBMENU_ID, "Window")
        .minimize()
        .maximize();
    #[cfg(target_os = "macos")]
    let window = window.separator().bring_all_to_front();
    let window = window.build()?;

    let help = SubmenuBuilder::with_id(app, HELP_SUBMENU_ID, "Help")
        .item(&item("help.shortcuts", "Keyboard Shortcuts", None)?)
        .item(&item("help.website", "Tapa on GitHub", None)?);
    // Windows/Linux convention: updates and About live under Help.
    #[cfg(not(target_os = "macos"))]
    let help = help
        .separator()
        .item(&check_updates)
        .separator()
        .item(&about);
    let help = help.build()?;

    let menu = Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &app_menu,
            &file,
            &edit,
            &view,
            &window,
            &help,
        ],
    )?;
    app.set_menu(menu)?;
    app.manage(RecentMenu(recent));
    Ok(())
}

#[cfg(any(target_os = "macos", windows))]
const SETTINGS_LABEL: &str = "Settings…";
#[cfg(not(any(target_os = "macos", windows)))]
const SETTINGS_LABEL: &str = "Preferences…";

/// Route a menu click: native items act here, every other custom item goes to
/// the frontend as `"menu"` with its id. Predefined items have numeric ids and
/// are handled by the OS, so they are skipped.
pub fn on_event(app: &AppHandle, id: &str) {
    match id {
        CLOSE_WINDOW => {
            if let Some(win) = focused_window(app) {
                let _ = win.close();
            }
        }
        #[cfg(not(target_os = "macos"))]
        FULLSCREEN => {
            if let Some(win) = focused_window(app) {
                let on = win.is_fullscreen().unwrap_or(false);
                let _ = win.set_fullscreen(!on);
            }
        }
        WEBSITE => {
            let _ = crate::file_ops::open_external(WEBSITE_URL.as_ref());
        }
        _ if is_frontend_id(id) => {
            let _ = app.emit("menu", id);
        }
        _ => {}
    }
}

fn focused_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.get("main"))
        .cloned()
}

/// Our ids are `area.action` or `recent:<path>`; muda's are bare numbers.
fn is_frontend_id(id: &str) -> bool {
    id.starts_with(RECENT_PREFIX) || (id.contains('.') && !id.starts_with("native:"))
}

/// Replace the Open Recent items with `paths` (most recent first).
#[tauri::command]
pub fn set_recent_menu(state: tauri::State<RecentMenu>, paths: Vec<String>) -> Result<(), String> {
    fill_recent(&state.0, &paths).map_err(|e| e.to_string())
}

fn fill_recent(sub: &Submenu<Wry>, paths: &[String]) -> tauri::Result<()> {
    while sub.remove_at(0)?.is_some() {}
    let app = sub.app_handle();
    if paths.is_empty() {
        sub.append(
            &MenuItemBuilder::with_id("file.noRecent", "No Recent Items")
                .enabled(false)
                .build(app)?,
        )?;
    }
    for path in paths {
        let id = format!("{RECENT_PREFIX}{path}");
        sub.append(&MenuItemBuilder::with_id(id, menu_text(&recent_label(path))).build(app)?)?;
    }
    let items: [&dyn IsMenuItem<Wry>; 2] = [
        &PredefinedMenuItem::separator(app)?,
        &MenuItemBuilder::with_id(CLEAR_RECENT, "Clear Menu")
            .enabled(!paths.is_empty())
            .build(app)?,
    ];
    sub.append_items(&items)
}

/// `name — parent folder`, so two `notes.md` in different folders differ.
fn recent_label(path: &str) -> String {
    let p = Path::new(path);
    let Some(name) = p.file_name() else {
        return path.to_string();
    };
    let name = name.to_string_lossy();
    match p.parent().and_then(Path::file_name) {
        Some(parent) => format!("{name} — {}", parent.to_string_lossy()),
        None => name.into_owned(),
    }
}

/// Windows menus treat `&` as a mnemonic marker; double it to show it.
fn menu_text(label: &str) -> String {
    if cfg!(windows) {
        label.replace('&', "&&")
    } else {
        label.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_label_shows_name_and_parent_folder() {
        assert_eq!(recent_label("/Users/me/Notes/todo.md"), "todo.md — Notes");
        assert_eq!(recent_label("/Users/me/Notes"), "Notes — me");
    }

    #[test]
    fn recent_label_handles_top_level_and_root() {
        assert_eq!(recent_label("/todo.md"), "todo.md");
        assert_eq!(recent_label("/"), "/");
    }

    #[test]
    fn only_our_ids_reach_the_frontend() {
        assert!(is_frontend_id("file.new"));
        assert!(is_frontend_id("recent:/Users/me/a.md"));
        assert!(is_frontend_id("recent:/no-dot-folder"));
        assert!(!is_frontend_id(CLOSE_WINDOW));
        assert!(!is_frontend_id("42"));
    }
}
