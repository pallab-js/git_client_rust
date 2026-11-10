pub mod debounce;
pub mod fswalk;
pub mod manager;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::AppHandle;

use crate::error::AppError;
use crate::models::WatcherState;
use crate::state::{AppState, RefreshMode};
use crate::store::RepoRecord;

pub struct WatchPaths {
    pub workdir: PathBuf,
    pub gitdirs: Vec<PathBuf>,
}

pub fn resolve_watch_paths(path: &str) -> Result<WatchPaths, AppError> {
    let repo = crate::git::open_repo(std::path::Path::new(path))?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| AppError::bare_repo(std::path::Path::new(path)))?
        .to_path_buf();
    let workdir = crate::git::canonicalize(&workdir)?;
    let mut gitdirs = vec![repo.path().to_path_buf()];
    let common = repo.commondir().to_path_buf();
    if common != repo.path() {
        gitdirs.push(common);
    }
    Ok(WatchPaths { workdir, gitdirs })
}

pub fn start_watcher(app: AppHandle, state: Arc<AppState>, record: &RepoRecord) {
    let settings = state.settings();
    let paths = match resolve_watch_paths(&record.path) {
        Ok(paths) => paths,
        Err(err) => {
            mark_watcher_unavailable(&app, &state, &record.id, err);
            return;
        }
    };

    let repo_id = record.id.clone();
    let on_event_app = app.clone();
    let on_event_state = Arc::clone(&state);
    let on_event_id = repo_id.clone();
    let on_event = move |kind: manager::WatchKind| {
        let mode = match kind {
            manager::WatchKind::Metadata => RefreshMode::Full,
            manager::WatchKind::Workdir => RefreshMode::Quick,
        };
        on_event_state.queue_refresh(on_event_id.clone(), mode);
        let _ = &on_event_app;
    };

    let on_degrade_app = app.clone();
    let on_degrade_state = Arc::clone(&state);
    let on_degrade_id = repo_id.clone();
    let on_degrade = move || {
        tracing::warn!("watcher for {} degraded to polling mode", on_degrade_id);
        if on_degrade_state
            .set_watcher_state(&on_degrade_id, WatcherState::Polling)
            .is_some()
        {
            if let Some(summary) = on_degrade_state.summary(&on_degrade_id) {
                crate::events::repo_updated(&on_degrade_app, &summary);
            }
            crate::tray::refresh(&on_degrade_app, &on_degrade_state);
        }
    };

    let result = {
        let mut watchers = match state.watchers.lock() {
            Ok(watchers) => watchers,
            Err(_) => {
                mark_watcher_unavailable(
                    &app,
                    &state,
                    &record.id,
                    AppError::new(
                        crate::models::ErrorCode::WatcherFailed,
                        "Watcher state was unavailable.",
                    ),
                );
                return;
            }
        };
        watchers.start(
            &repo_id,
            manager::WatchOptions {
                workdir: paths.workdir,
                gitdirs: paths.gitdirs,
                force_polling: matches!(settings.watch_mode, crate::models::WatchMode::Polling),
                linux_dir_cap: settings.linux_watch_dir_cap,
                ignored_patterns: settings.ignored_patterns.clone(),
            },
            on_event,
            on_degrade,
        )
    };

    match result {
        Ok(watcher_state) => {
            if let Some(summary) = state.set_watcher_state(&repo_id, watcher_state) {
                crate::events::repo_updated(&app, &summary);
            }
        }
        Err(err) => {
            tracing::warn!("watcher for {} failed: {err}", record.path);
            mark_watcher_unavailable(&app, &state, &record.id, err);
        }
    }
}

pub fn stop_watcher(state: &AppState, repo_id: &str) {
    if let Ok(mut watchers) = state.watchers.lock() {
        watchers.stop(repo_id);
    }
}

pub fn stop_all(state: &AppState) {
    if let Ok(mut watchers) = state.watchers.lock() {
        watchers.stop_all();
    }
}

pub fn restart_all(app: &AppHandle, state: &Arc<AppState>) {
    stop_all(state);
    for record in state.repos_snapshot() {
        start_watcher(app.clone(), Arc::clone(state), &record);
    }
}

fn mark_watcher_unavailable(
    app: &AppHandle,
    state: &Arc<AppState>,
    repo_id: &str,
    error: AppError,
) {
    if let Some(summary) = state.set_watcher_state(repo_id, WatcherState::Unavailable) {
        crate::events::repo_updated(app, &summary);
    }
    tracing::debug!("watcher unavailable for {repo_id}: {error}");
}
