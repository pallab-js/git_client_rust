use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::models::{RepoSummary, ScanCompleted, ScanProgress, TrayStats};
use crate::state::AppState;

pub const REPO_UPDATED: &str = "repo:updated";
pub const REPO_REMOVED: &str = "repo:removed";
pub const REPO_SELECT: &str = "repo:select";
pub const SCAN_PROGRESS: &str = "scan:progress";
pub const SCAN_COMPLETED: &str = "scan:completed";
pub const APP_ERROR: &str = "app:error";
pub const TRAY_STATS: &str = "tray:stats";

pub fn repo_updated(app: &AppHandle, summary: &RepoSummary) {
    if let Err(err) = app.emit(REPO_UPDATED, summary) {
        tracing::warn!("could not emit repo:updated: {err}");
    }
}

pub fn repo_removed(app: &AppHandle, id: &str) {
    if let Err(err) = app.emit(REPO_REMOVED, serde_json::json!({ "id": id })) {
        tracing::warn!("could not emit repo:removed: {err}");
    }
}

pub fn repo_select(app: &AppHandle, id: &str) {
    if let Err(err) = app.emit(REPO_SELECT, serde_json::json!({ "id": id })) {
        tracing::warn!("could not emit repo:select: {err}");
    }
}

pub fn scan_progress(app: &AppHandle, progress: &ScanProgress) {
    if let Err(err) = app.emit(SCAN_PROGRESS, progress) {
        tracing::warn!("could not emit scan:progress: {err}");
    }
}

pub fn scan_completed(app: &AppHandle, completed: &ScanCompleted) {
    if let Err(err) = app.emit(SCAN_COMPLETED, completed) {
        tracing::warn!("could not emit scan:completed: {err}");
    }
}

pub fn app_error(app: &AppHandle, error: &AppError) {
    if let Err(err) = app.emit(APP_ERROR, error) {
        tracing::warn!("could not emit app:error: {err}");
    }
}

pub fn tray_stats(app: &AppHandle, stats: &TrayStats) {
    if let Err(err) = app.emit(TRAY_STATS, stats) {
        tracing::warn!("could not emit tray:stats: {err}");
    }
}

pub fn current_tray_stats(state: &AppState) -> TrayStats {
    state.tray_stats()
}
