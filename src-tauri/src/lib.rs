pub mod commands;
pub mod error;
pub mod events;
pub mod git;
pub mod launcher;
pub mod models;
pub mod notify;
pub mod state;
pub mod store;
pub mod tray;
pub mod watch;
pub mod windows;

use std::sync::Arc;

use tauri::{Manager, RunEvent};
use tauri_plugin_autostart::MacosLauncher;
use tracing_subscriber::EnvFilter;

use crate::state::{AppState, RefreshMode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let state = app.state::<Arc<AppState>>().inner().clone();
            windows::show_main(app, &state);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            let app_data = app.path().app_data_dir().map_err(|error| {
                error::AppError::config(format!("No app-data directory: {error}"))
            })?;
            std::fs::create_dir_all(&app_data)?;
            init_logging(&app_data);

            let state = Arc::new(AppState::load(&app_data)?);
            let warning = state.config_warning();
            app.manage(Arc::clone(&state));

            tray::build(app.handle(), &state)?;

            if let Some(message) = warning {
                let error = error::AppError::config(message);
                events::app_error(app.handle(), &error);
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(commands::run_refresh_worker(
                handle.clone(),
                Arc::clone(&state),
            ));
            tauri::async_runtime::spawn(commands::run_scheduler(
                handle.clone(),
                Arc::clone(&state),
            ));

            for record in state.repos_snapshot() {
                watch::start_watcher(handle.clone(), Arc::clone(&state), &record);
            }
            state.queue_all(RefreshMode::Full);

            let settings = state.settings();
            sync_autostart(app.handle(), settings.launch_at_login);

            if state.repos_snapshot().is_empty() || !settings.start_minimized {
                windows::show_main(app.handle(), &state);
            } else {
                windows::apply_activation_policy(app.handle(), &state);
            }

            Ok(())
        })
        .on_window_event(windows::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::repos::list_repos,
            commands::repos::add_repo,
            commands::repos::scan_folder,
            commands::repos::cancel_scan,
            commands::repos::add_repos,
            commands::repos::remove_repo,
            commands::repos::locate_repo,
            commands::repos::set_repo_pinned,
            commands::repos::reorder_repos,
            commands::repos::set_repo_watch_mode,
            commands::git::refresh_repo,
            commands::git::refresh_all,
            commands::git::get_repo_changes,
            commands::git::get_repo_commits,
            commands::git::get_repo_branches,
            commands::git::get_file_diff,
            commands::git::get_activity,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::open_in_editor,
            commands::settings::reveal_repo,
            commands::window::show_main_window,
            commands::window::toggle_popover,
            commands::window::take_pending_selection,
            commands::window::export_diagnostics,
        ]);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            tracing::error!("could not start GitPulse: {error}");
            eprintln!("GitPulse could not start: {error}");
            return;
        }
    };

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let state = app_handle.state::<Arc<AppState>>().inner().clone();
            let quitting = state.quitting.load(std::sync::atomic::Ordering::Relaxed);
            if !quitting && !windows::main_is_open(app_handle) {
                api.prevent_exit();
            } else if !quitting {
                watch::stop_all(&state);
            }
        }
    });
}

fn init_logging(app_data: &std::path::Path) {
    let log_dir = app_data.join("logs");
    if std::fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let appender = tracing_appender::rolling::daily(&log_dir, "gitpulse.log");
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false)
        .with_writer(appender)
        .try_init();
}

fn sync_autostart(app: &tauri::AppHandle, enabled: bool) {
    use tauri_plugin_autostart::ManagerExt;
    match app.autolaunch().is_enabled() {
        Ok(current) if current == enabled => {}
        Ok(_) => {
            let result = if enabled {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            if let Err(error) = result {
                tracing::warn!("could not sync autostart: {error}");
            }
        }
        Err(error) => {
            tracing::debug!("could not read autostart state: {error}");
        }
    }
}
