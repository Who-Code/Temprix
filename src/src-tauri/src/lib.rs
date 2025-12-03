mod tracking;

use tracking::ActivityTracker;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder};
use tauri::{Manager, State};
use std::process::Command;

// Commands
#[tauri::command]
fn get_patterns(tracker: State<Arc<ActivityTracker>>) -> Vec<String> {
    tracker.get_patterns()
}

#[tauri::command]
fn update_patterns(tracker: State<Arc<ActivityTracker>>, patterns: Vec<String>) {
    tracker.update_patterns(patterns);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tracker = ActivityTracker::new();
    let tracker_arc = Arc::new(tracker);
    
    // Clone for thread
    let tracker_for_thread = tracker_arc.clone();
    thread::spawn(move || {
        loop {
            tracker_for_thread.check_activity();
            thread::sleep(Duration::from_secs(5));
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(tracker_arc.clone()) // Manage state so commands can access it
        .invoke_handler(tauri::generate_handler![get_patterns, update_patterns])
        .setup(move |app| {
            // Hide main window if it exists
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_dir_i = MenuItem::with_id(app, "open_dir", "Open Activity Folder", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let status_i = MenuItem::with_id(app, "status", "Status: Initializing...", false, None::<&str>)?;
            
            let menu = Menu::with_items(app, &[&status_i, &show_dir_i, &settings_i, &quit_i])?;

            let tracker_for_menu = tracker_arc.clone();

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "open_dir" => {
                             let path = tracker_for_menu.get_storage_dir();
                             #[cfg(target_os = "macos")]
                             let _ = Command::new("open").arg(path).spawn();
                             #[cfg(target_os = "windows")]
                             let _ = Command::new("explorer").arg(path).spawn();
                        }
                        "settings" => {
                            // Create or show settings window
                            if let Some(window) = app.get_webview_window("settings") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                let _ = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "settings",
                                    tauri::WebviewUrl::App("settings.html".into()),
                                )
                                .title("Activity Tracker Settings")
                                .inner_size(600.0, 400.0)
                                .build();
                            }
                        }
                         _ => {}
                    }
                })
                .build(app)?;
                
            let tracker_for_status = tracker_arc.clone();
            let status_item_handle = status_i.clone();
            
            thread::spawn(move || {
                loop {
                    let status = tracker_for_status.get_current_status();
                    let _ = status_item_handle.set_text(status);
                    thread::sleep(Duration::from_secs(2));
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
