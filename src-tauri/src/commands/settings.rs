use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::models::{Settings, SettingsPatch};
use crate::state::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, Arc<AppState>>) -> Result<Settings, AppError> {
    Ok(state.settings())
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    patch: SettingsPatch,
) -> Result<Settings, AppError> {
    let state = Arc::clone(state.inner());
    let mut next = state.settings();
    next.apply_patch(patch);
    next.validate().map_err(AppError::config)?;

    let launch_at_login_changed = state.settings().launch_at_login != next.launch_at_login;
    if launch_at_login_changed {
        sync_autostart(&app, next.launch_at_login)?;
    }

    state.config_store.save(&next)?;
    let previous = state.settings();
    state.replace_settings(next.clone());

    let watcher_changed = previous.watch_mode != next.watch_mode
        || previous.linux_watch_dir_cap != next.linux_watch_dir_cap
        || previous.ignored_patterns != next.ignored_patterns;
    if watcher_changed {
        crate::watch::restart_all(&app, &state);
    }
    crate::tray::refresh(&app, &state);
    crate::windows::apply_activation_policy(&app, &state);
    Ok(next)
}

fn sync_autostart(app: &AppHandle, enabled: bool) -> AppResult<()> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| {
        AppError::config(format!(
            "Could not update launch-at-login: {error}. Change it in your system settings instead."
        ))
    })
}

#[tauri::command]
pub async fn open_in_editor(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    crate::launcher::open_in_editor(&app, &state, &id)
}

#[tauri::command]
pub async fn reveal_repo(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    let record = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&record.path)
        .map_err(|error| {
            AppError::new(
                crate::models::ErrorCode::Unknown,
                format!("Could not reveal this folder: {error}"),
            )
        })
}
