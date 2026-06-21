//! Teleprompter overlay panel (macOS).
//!
//! The overlay is converted into an `NSPanel` so it can behave like a HUD that
//! the rest of the app never has to fight with:
//! - level 25 (`NSMainMenuWindowLevel` + 1) floats it above the menu bar and
//!   into the notch zone, so it stays visible at the very top of the screen;
//! - the non-activating style mask (`1 << 7`) means clicking/showing the panel
//!   never steals keyboard focus from the document being read;
//! - the collection behaviour (CanJoinAllSpaces | FullScreenAuxiliary |
//!   Stationary) lets it ride along over every Space and over fullscreen apps
//!   without being swept away by Mission Control.
//!
//! `order_front_regardless` shows it WITHOUT activating the app — using
//! `show()` here would defeat the non-activating panel.

#[tauri::command]
pub fn setup_overlay(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let window = app
        .get_webview_window("teleprompter")
        .ok_or_else(|| "teleprompter window not found".to_string())?;
    #[cfg(target_os = "macos")]
    {
        app.run_on_main_thread(move || configure_panel(&window))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.show();
    }
    Ok(())
}

#[cfg(target_os = "macos")]
#[allow(deprecated)] // cocoa's NSWindowCollectionBehavior is deprecated upstream, but it is what tauri-nspanel's API takes.
fn configure_panel(window: &tauri::WebviewWindow) {
    use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;
    use tauri_nspanel::WebviewWindowExt;
    let Ok(panel) = window.to_panel() else { return };
    panel.set_level(25); // NSMainMenuWindowLevel (24) + 1 → above the menu bar / notch
    #[allow(non_upper_case_globals)]
    const NS_NONACTIVATING_PANEL: i32 = 1 << 7; // NSWindowStyleMaskNonActivatingPanel
    panel.set_style_mask(NS_NONACTIVATING_PANEL);
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary,
    );
    // Transparent window: let the rounded-corner CSS show through outside the radius.
    panel.set_opaque(false);
    // Re-place at the top-center now that it is a high-level panel (a position set on
    // the pre-conversion normal window is clamped below the menu bar). TOP_Y=0 sits at
    // the work-area top, just under the menu bar; a negative TOP_Y lifts it flush to
    // the physical top / behind the notch, bleeding the top edge off-screen.
    const WIN_WIDTH: f64 = 560.0; // keep in sync with overlay.ts WIDTH
    const TOP_Y: f64 = 0.0;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale = monitor.scale_factor();
        let mon_w = monitor.size().width as f64 / scale;
        let x = ((mon_w - WIN_WIDTH) / 2.0).max(0.0);
        let _ = window.set_position(tauri::LogicalPosition::new(x, TOP_Y));
    }
    panel.order_front_regardless(); // show WITHOUT activating the app (never use show())
}
