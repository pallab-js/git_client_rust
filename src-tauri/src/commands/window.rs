use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::models::ExportResult;
use crate::state::AppState;

#[tauri::command]
pub async fn show_main_window(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    crate::windows::show_main(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn toggle_popover(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    crate::windows::toggle_popover(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn take_pending_selection(
    state: State<'_, Arc<AppState>>,
) -> Result<Option<String>, AppError> {
    Ok(state.take_pending_selection())
}

#[tauri::command]
pub async fn export_diagnostics(
    state: State<'_, Arc<AppState>>,
    dest_path: String,
) -> Result<ExportResult, AppError> {
    let state = Arc::clone(state.inner());
    let settings = state.settings();
    let repos: Vec<serde_json::Value> = state
        .sorted_repos()
        .into_iter()
        .map(|summary| {
            serde_json::json!({
                "name": summary.name,
                "path": summary.path,
                "primaryStatus": summary.primary_status,
                "branch": summary.branch,
                "ahead": summary.ahead,
                "behind": summary.behind,
                "counts": summary.counts,
                "watcher": summary.watcher,
                "updatedAt": summary.updated_at,
                "error": summary.error,
            })
        })
        .collect();

    let payload = serde_json::json!({
        "app": "GitPulse",
        "version": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "settings": settings,
        "repositories": repos,
        "notes": "Diagnostics contain repository paths and status only. File contents and commit messages are not included."
    });

    let path = std::path::PathBuf::from(&dest_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&payload)?;
    std::fs::write(&path, json)
        .map_err(|error| AppError::invalid_path(format!("Could not save diagnostics: {error}")))?;
    Ok(ExportResult {
        path: path.to_string_lossy().to_string(),
    })
}
