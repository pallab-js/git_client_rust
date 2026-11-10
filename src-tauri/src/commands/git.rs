use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::{
    BranchEntry, CommitPage, FileChange, FileDiff, RefreshModeArg, RepoSummary, WatcherState,
};
use crate::state::{summary_from_status, unavailable_summary, AppState, RefreshMode};

fn compute_summary(
    record: &crate::store::RepoRecord,
    watcher: WatcherState,
) -> AppResult<RepoSummary> {
    let mut repo = git::open_repo(Path::new(&record.path))?;
    let status = git::read_status(&mut repo, false)?;
    let last_fetch = git::last_fetch_at(&repo);
    Ok(summary_from_status(record, &status, last_fetch, watcher))
}

pub async fn perform_refresh(
    app: AppHandle,
    state: Arc<AppState>,
    repo_id: String,
    _mode: RefreshMode,
) -> AppResult<RepoSummary> {
    let Some(record) = state.repo(&repo_id) else {
        return Err(AppError::new(
            crate::models::ErrorCode::Unknown,
            "That repository is no longer in the list.",
        ));
    };

    let lock = state.repo_lock(&repo_id);
    let _guard = lock.lock().await;

    let previous = state.summary(&repo_id);
    let watcher = previous
        .as_ref()
        .map(|summary| summary.watcher)
        .unwrap_or(WatcherState::Unavailable);

    let record_for_job = record.clone();
    let result = tokio::task::spawn_blocking(move || compute_summary(&record_for_job, watcher))
        .await
        .map_err(|err| {
            AppError::new(
                crate::models::ErrorCode::Unknown,
                format!("Status job failed unexpectedly: {err}"),
            )
        });

    let mut summary = match result {
        Ok(Ok(summary)) => summary,
        Ok(Err(error)) => unavailable_summary(&record, error),
        Err(error) => unavailable_summary(&record, error),
    };

    summary.revision = state.bump_revision(&repo_id);
    summary.updated_at = chrono::Utc::now().to_rfc3339();
    state.put_summary(summary.clone());

    if let Err(error) = state.db.update_cached_summary(&summary) {
        tracing::warn!("could not cache summary for {}: {error}", summary.id);
        crate::events::app_error(&app, &error);
    }

    if summary.error.is_none() {
        if let Err(error) = state.db.insert_snapshot(&summary) {
            tracing::warn!("could not write snapshot for {}: {error}", summary.id);
            crate::events::app_error(&app, &error);
        }
        if let Err(error) =
            crate::store::activity::record_transitions(&state.db, previous.as_ref(), &summary)
        {
            tracing::warn!("could not record activity for {}: {error}", summary.id);
        }
        crate::notify::maybe_notify(&app, previous.as_ref(), &summary, &state.settings());
    }

    crate::events::repo_updated(&app, &summary);
    crate::tray::refresh(&app, &state);
    Ok(summary)
}

#[tauri::command]
pub async fn refresh_repo(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    mode: Option<RefreshModeArg>,
) -> Result<RepoSummary, AppError> {
    let state = Arc::clone(state.inner());
    let mode = match mode.unwrap_or(RefreshModeArg::Quick) {
        RefreshModeArg::Quick => RefreshMode::Quick,
        RefreshModeArg::Full => RefreshMode::Full,
    };
    perform_refresh(app, state, id, mode).await
}

#[tauri::command]
pub async fn refresh_all(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), AppError> {
    let state = Arc::clone(state.inner());
    for record in state.repos_snapshot() {
        state.queue_refresh(record.id, RefreshMode::Quick);
    }
    crate::tray::refresh(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn get_repo_changes(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<FileChange>, AppError> {
    let state = Arc::clone(state.inner());
    let record = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;
    tokio::task::spawn_blocking(move || {
        let mut repo = git::open_repo(Path::new(&record.path))?;
        let status = git::read_status(&mut repo, true)?;
        Ok(status.changes)
    })
    .await
    .map_err(|err| {
        AppError::new(
            crate::models::ErrorCode::Unknown,
            format!("Change list job failed: {err}"),
        )
    })?
}

#[tauri::command]
pub async fn get_repo_commits(
    state: State<'_, Arc<AppState>>,
    id: String,
    cursor: Option<String>,
    limit: usize,
) -> Result<CommitPage, AppError> {
    let state = Arc::clone(state.inner());
    let record = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;
    tokio::task::spawn_blocking(move || {
        let repo = git::open_repo(Path::new(&record.path))?;
        git::log::list_commits(&repo, cursor.as_deref(), limit)
    })
    .await
    .map_err(|err| {
        AppError::new(
            crate::models::ErrorCode::Unknown,
            format!("Commit list job failed: {err}"),
        )
    })?
}

#[tauri::command]
pub async fn get_repo_branches(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<BranchEntry>, AppError> {
    let state = Arc::clone(state.inner());
    let record = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;
    tokio::task::spawn_blocking(move || {
        let repo = git::open_repo(Path::new(&record.path))?;
        git::branches::list_branches(&repo)
    })
    .await
    .map_err(|err| {
        AppError::new(
            crate::models::ErrorCode::Unknown,
            format!("Branch list job failed: {err}"),
        )
    })?
}

#[tauri::command]
pub async fn get_file_diff(
    state: State<'_, Arc<AppState>>,
    id: String,
    path: String,
    staged: bool,
) -> Result<FileDiff, AppError> {
    let state = Arc::clone(state.inner());
    let record = state
        .repo(&id)
        .ok_or_else(|| AppError::new(crate::models::ErrorCode::Unknown, "Unknown repository."))?;
    tokio::task::spawn_blocking(move || {
        let repo = git::open_repo(Path::new(&record.path))?;
        git::diff::file_diff(&repo, &path, staged)
    })
    .await
    .map_err(|err| {
        AppError::new(
            crate::models::ErrorCode::Unknown,
            format!("Diff job failed: {err}"),
        )
    })?
}

#[tauri::command]
pub async fn get_activity(
    state: State<'_, Arc<AppState>>,
    id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<crate::models::ActivityEntry>, AppError> {
    let state = Arc::clone(state.inner());
    let limit = limit.unwrap_or(100);
    tokio::task::spawn_blocking(move || state.db.list_activity(id.as_deref(), limit))
        .await
        .map_err(|err| {
            AppError::new(
                crate::models::ErrorCode::DbError,
                format!("Activity job failed: {err}"),
            )
        })?
}
